import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { PeerManagementService } from '@lib/tcp-transport/components/peer-management.service'
import { DataHandlerService } from '@lib/tcp-transport/components/data-handler.service'
import * as net from 'net'
import * as tls from 'tls'
import * as fs from 'fs'
import * as path from 'path'
import { FrameDecoderService } from '@lib/tcp-transport/components/framing.servcie'
import {
	PeerInfo,
	RegisteredTcpCommandType,
	TcpCommandType,
	TcpDevOptions,
	TcpOptions,
	TcpSecurityOptions,
} from '@lib/tcp-transport/types'
import {
	DEFAULT_RECONNECT_DELAY,
	MAX_DELAY,
	PEER_ID_RE,
	PENDING_BEFORE_CLOSING_DELAY,
} from '@lib/tcp-transport/constants'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'

type Socket = net.Socket
type TlsServer = tls.Server
type NetServer = net.Server

@Injectable()
export class ConnectionManagerService {
	private readonly logger = new Logger(ConnectionManagerService.name)

	/* Метка запуска закрытия сервера */
	private isCloseServer: boolean = false
	/* Текущий сервер */
	private server: NetServer | TlsServer
	/* Список декодеров на каждый сокет */
	private decoders = new Map<Socket, FrameDecoderService>()
	/* Список TCP соединений */
	public sockets = new Map<string, Socket>()

	constructor(
		@Inject(forwardRef(() => PeerManagementService))
		private peerManagement: PeerManagementService,
		@Inject(forwardRef(() => DataHandlerService))
		private dataHandler: DataHandlerService,
		@Inject('TCP_OPTIONS') private readonly tcpOptions: TcpOptions
	) {}

	/** Закрытие приложения/транспорта */
	public async close() {
		this.isCloseServer = true

		/* Ждем делей перед закрытием */
		await new Promise((resolve) =>
			setTimeout(resolve, PENDING_BEFORE_CLOSING_DELAY)
		)

		for (const s of this.sockets.values()) {
			s.destroy()
		}
		for (const d of this.decoders.values()) {
			d.reset()
		}
		this.sockets.clear()
		this.decoders.clear()
		this.server.close()
	}

	/** Получаем peer */
	private get self() {
		return this.peerManagement.self
	}
	private get peers() {
		return this.peerManagement.peers
	}

	/** Запускает сервер */
	public start() {
		this.isCloseServer = false
		this.listenServer()
		this.connectDialers()
	}

	/** Создаем сервер */
	private listenServer() {
		this.server = this.createTcpServer((sock) => {
			/* Удаляем подключение в случае успеха */
			const onData = (chunk: Buffer) => {
				if (this.handleRegisterFrame(sock, chunk)) {
					sock.off('data', onData)
				}
			}

			/* Создаем первое подключение между сокетами на регистрацию сокета в текущем кластере */
			sock.on('data', onData)
		})
		this.server.listen(this.self.port, () => {
			this.logger.log(`[${this.self.id}] TCP listen ${this.self.port}`)
		})
	}

	/** Событие регистрации нового соединения */
	private handleRegisterFrame(sock: Socket, chunk: Buffer) {
		const decoder = this.getDecoder(sock)
		for (const frame of decoder.push(chunk)) {
			const command = frame as RegisteredTcpCommandType
			const { peerId } = command?.data || {}

			/* Проверяем входящие данные */
			const { err } = this.dataHandler.validateRegisterFrame(command)

			if (err) {
				/* В случае ошибки разрывает соединения */
				return sock.destroy(new Error(err)), false
			} else {
				/* В случае успеха - регистрируем */
				this.logger.log('once', peerId)
				this.registerSocket(peerId!, sock)
				return true
			}
		}
	}

	/** Получаем нужный сервер в зависимости от параметров */
	private createTcpServer(
		callback: (sock: Socket) => void
	): NetServer | TlsServer {
		return this.tcpOptions.enableTLS
			? this.createTlsServer(this.tcpOptions, callback)
			: this.createNetServer(this.tcpOptions, callback)
	}

	/** Создаем сервер Tls */
	private createTlsServer(
		opt: TcpSecurityOptions,
		callback: (sock: Socket) => void
	): TlsServer {
		const {
			tls: {
				certPath = '/etc/ssl/certs/',
				keyFileName,
				certFileName,
				caFileName,
				rejectUnauthorized = false,
			} = {},
		} = opt

		if (!keyFileName) {
			throw new Error('Not filled "keyFileName"')
		}

		if (!certFileName) {
			throw new Error('Not filled "certFileName"')
		}

		return tls.createServer(
			{
				key: fs.readFileSync(path.join(certPath, keyFileName)),
				cert: fs.readFileSync(path.join(certPath, certFileName)),
				ca: caFileName
					? fs.readFileSync(path.join(certPath, caFileName))
					: undefined,
				requestCert: true,
				rejectUnauthorized,
			},
			callback
		)
	}

	/** Создаем сервер Net */
	private createNetServer(
		opt: TcpDevOptions,
		callback: (sock: Socket) => void
	): NetServer {
		return net.createServer(callback)
	}

	/** Подключаем исходящие пиры */
	private connectDialers() {
		for (const peer of this.peers) {
			if (peer.id > this.self.id) continue // чтобы не было дубликатов
			this.connectPeer(peer)
		}
	}

	/** Подключаемся к исходящему пиру */
	private connectPeer(peer: PeerInfo) {
		let reconnectDelay = DEFAULT_RECONNECT_DELAY

		/* todo: ограничить реконекты */
		const dial = () => {
			/* reconnection storm */
			const delay =
				Math.min(MAX_DELAY, (reconnectDelay *= 2)) +
				Math.random() * 0.3 * reconnectDelay

			const sock = this.connectionSocket(peer)

			sock.once('connect', () => {
				const selfPeerId = this.peerManagement.self.id
				this.logger.log(`[${selfPeerId}] → dial ${peer.id}`)
				this.dataHandler.safeWrite(sock, {
					type: TcpTypesEnum.RegisteredSocket,
					data: this.dataHandler.buildRegisterFrame(selfPeerId),
				})
			})

			this.registerSocket(peer.id, sock)

			sock.once('close', () => {
				setTimeout(dial, delay)
			})
		}

		dial()
	}

	/** Коннект к сокету */
	private connectionSocket(peer: PeerInfo): Socket {
		if (this.tcpOptions.enableTLS) {
			return this.connectionTlsSocket(this.tcpOptions, peer)
		} else {
			return this.connectionNetSocket(this.tcpOptions, peer)
		}
	}

	/** Конект к Tls */
	private connectionTlsSocket(opt: TcpSecurityOptions, peer: PeerInfo) {
		const {
			tls: { certPath = '/etc/ssl/certs/', caFileName, rejectUnauthorized },
		} = opt

		return tls.connect({
			host: peer.host,
			port: peer.port,
			ca: caFileName
				? fs.readFileSync(path.join(certPath, caFileName))
				: undefined,
			rejectUnauthorized,
		})
	}

	/** Конект к Net */
	private connectionNetSocket(opt: TcpDevOptions, peer: PeerInfo) {
		return new net.Socket().connect(peer.port, peer.host)
	}

	/** Регистрируем сокет */
	/* todo: При ребуте сокета с более низким id не проходит коннект */
	private registerSocket(peerId: string, sock: Socket) {
		const prev = this.sockets.get(peerId)
		if (prev && prev !== sock) prev.destroy() // убиваем дубликат

		this.sockets.set(peerId, sock)

		sock
			.once('error', (err) => this.logger.error('error socker: ', err))
			.once('close', () => {
				this.logger.log(
					`sock close: [${this.peerManagement.self.id}] ←→ [${peerId}]`
				)
				this.deleteSocket(peerId)
			})

		this.attachDataHandler(peerId, sock)
	}

	/** Удаляем сокет */
	private deleteSocket(
		peerId: string,
		sock: Socket | undefined = this.getSocket(peerId)
	) {
		if (!sock) {
			return
		}

		this.deleteDecoder(sock)
		this.dataHandler.cleanupDrainSocket(sock)
		this.peerManagement.remove(peerId)
		sock.destroy()
		this.sockets.delete(peerId)
	}

	/** Удаляем декодер */
	private deleteDecoder(sock: Socket) {
		const decoder = this.decoders.get(sock)
		if (decoder) {
			decoder.reset()
			this.decoders.delete(sock)
		}
	}

	/** Вернет декодер или создаст новый */
	public getDecoder(sock: Socket): FrameDecoderService {
		return this.decoders.get(sock) ?? this.createAndRegisterDecoder(sock)
	}

	/** Получаем сокет по id */
	public getSocket(peerId: string) {
		return this.sockets.get(peerId)
	}

	/** Создаем декодер */
	private createAndRegisterDecoder(sock: Socket): FrameDecoderService {
		const decoder = new FrameDecoderService()
		this.decoders.set(sock, decoder)
		return decoder
	}

	/** Парсим и читаем сообщение */
	private attachDataHandler(fromId: string, sock: Socket) {
		sock.on('data', async (chunk: Buffer) => {
			if (this.isCloseServer) throw new Error('Server is closed!')

			const decoder = this.getDecoder(sock)

			for (let chunkCommand of decoder.push(chunk)) {
				const command = chunkCommand as TcpCommandType

				this.dataHandler.acceptRequest({ ...command, fromId }, sock)
			}
		})
	}
}
