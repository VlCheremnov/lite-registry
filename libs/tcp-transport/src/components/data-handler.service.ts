import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import {
	EventEmitTcpDataType,
	RegisteredTcpCommandType,
	TcpCommandType,
	TcpOptions,
	TcpResponse,
} from '@lib/tcp-transport/types'
import { Socket } from 'net'
import { encodeFrame } from '@lib/tcp-transport/components/framing.servcie'
import { once } from 'node:events'
import * as crypto from 'node:crypto'
import { TcpTransport } from '@lib/tcp-transport'
import {
	ALLOWED_DRIFT,
	DEFAULT_RESPONSE_TIMEOUT,
	DRAIN_DELAY,
	PEER_ID_RE,
	RESPONSE_PREFIX,
} from '@lib/tcp-transport/constants'
import { TcpTypesEnum } from '@lib/tcp-transport/enums'

@Injectable()
export class DataHandlerService {
	private readonly logger = new Logger(DataHandlerService.name)

	private drainSocketPromises = new Map<Socket, Promise<void>>()
	private responseTimeout: number

	constructor(
		@Inject(forwardRef(() => TcpTransport))
		private readonly transport: TcpTransport,
		@Inject('TCP_OPTIONS') private readonly cfg: TcpOptions
	) {
		this.responseTimeout = this.cfg.responseTimeout ?? DEFAULT_RESPONSE_TIMEOUT
	}

	/** Формируем наименование ивента для ответа */
	private getResponseEventName(id: string) {
		return `${RESPONSE_PREFIX}${id}`
	}

	public close() {
		this.drainSocketPromises.clear()
	}

	/** Обрабатываем ответ и отправляем ответ, если он есть */
	async acceptRequest(command: EventEmitTcpDataType, sock: Socket) {
		try {
			if (command.isResponse && command.id) {
				this.logger.log('Получаем ответ')
				sock.emit(this.getResponseEventName(command.id), command.data)
				return
			}

			const handler = this.transport.getHandler(command.type)
			if (!handler) return

			/* Ждем Observable/Promise/значение */
			const resp$ = this.transport.transformToObservable(await handler(command))
			/*  если есть ответ - отправляем обратно */
			resp$.subscribe(async (data) => {
				return this.safeWrite(sock, {
					isResponse: true,
					type: command.type,
					id: command.id,
					data: data || { status: 'ok' },
				})
			})
		} catch (err) {
			/* bad frame */
			this.logger.error('tcp onData err', err)
		}
	}

	/** Вызываем safeWrite и ждем обратного ответа */
	async sendMessage<T = any>(
		sock: Socket,
		payload: TcpCommandType,
		peerId: string
	): Promise<TcpResponse<T>> {
		/* Формируем уникальный id запроса */
		const id = crypto.randomUUID().replace(/-/g, '')

		await this.safeWrite(sock, { ...payload, id } as TcpCommandType)

		/* Возвращаем ответ */
		return new Promise(async (resolve, reject) => {
			const event = this.getResponseEventName(id)
			const ac = new AbortController()

			setTimeout(
				() => ac.abort(new Error(`TIMEOUT ${this.responseTimeout / 1000} s.`)),
				this.responseTimeout
			)

			try {
				const [payload] = await once(sock, event, {
					signal: ac.signal,
				})

				resolve({ peerId, payload } as TcpResponse<T>)
			} catch (err) {
				if (err.code === 'ABORT_ERR') {
					resolve({
						peerId,
						err: {
							name: 'Timeout',
							message: `Request timed out after ${this.responseTimeout}ms`,
							code: 'TIMEOUT',
						},
					} as TcpResponse<T>)
				} else {
					/** todo: Обработать ошибку, сделать реконекты и если не получится - разорвать сокет */
					reject(err)
				}
			}
		})
	}

	/** Отправляем сообщение */
	public async safeWrite(sock: Socket, data: TcpCommandType) {
		/*
		 * Если send-буфер забит, то ждем "drain".
		 * "drain" гарантирует, что ОС освободила место для следующих пакетов
		 * */
		const frame = encodeFrame(data)

		if (sock.write(frame)) return

		/* Ждем DRAIN_DELAY или пока освободится буфер */
		await Promise.race([
			this.getDrainPromise(sock),
			new Promise((resolve, reject) =>
				setTimeout(() => reject(new Error('DRain timeout >5s')), DRAIN_DELAY)
			),
		])

		// Если повторный запрос не ушел - считаем его "тяжелым"
		/* todo: Продумать реконект или очищать все состояние */
		if (!sock.write(frame)) {
			this.logger.error('Ошибка при отправке сообщения')
			throw new Error('Persistent back-pressure')
			// sock.destroy(new Error('Persistent back-pressure'))
		}
	}

	/** Получаем промис для очистки памяти если сообщение не отправилось */
	private getDrainPromise(sock: Socket): Promise<void> {
		let promise = this.drainSocketPromises.get(sock)
		if (!promise) {
			promise = once(sock, 'drain').then(() => {
				this.cleanupDrainSocket(sock)
			})
			this.drainSocketPromises.set(sock, promise)
		}
		return promise
	}

	/** Подчищаем неиспользуемые промисы */
	public cleanupDrainSocket(sock: Socket) {
		this.drainSocketPromises.delete(sock)
	}

	/** Создаем сообщение регистрации */
	public buildRegisterFrame(peerId: string) {
		const ts = Date.now()
		const sign = this.createSign(`${peerId}:${ts}`)

		return { peerId, ts, sign }
	}

	/** Валидируем входящее сообщение на регистрацию сокета */
	public validateRegisterFrame(command: RegisteredTcpCommandType): {
		err?: string
	} {
		const { peerId, sign, ts } = command?.data || {}

		let err: string | undefined

		/* Проверяем первый входящий запрос по сокету */
		/* Если получаем невалидный запрос - вызываем ошибку и возвращаем false */
		if (command.type !== TcpTypesEnum.RegisteredSocket)
			err = 'Socket not registered'
		else if (!peerId) err = 'Not found "peerId'
		else if (!PEER_ID_RE.test(peerId)) err = 'Bad peerId'
		else if (!ts) err = 'Not found "ts"'
		else if (!sign) err = 'Not found "sign"'
		else if (!this.verifyRegisterFrame({ peerId, sign, ts }))
			err = 'Bad HMAC signature'

		return { err }
	}

	/** Верификация и шифрование сообщения регистрации сокета */
	private verifyRegisterFrame(frame: {
		peerId: string
		ts: number
		sign: string
	}) {
		const { peerId, ts, sign } = frame

		if (Math.abs(Date.now() - ts) > ALLOWED_DRIFT) {
			return false
		}

		const expect = this.createSign(`${peerId}:${ts}`)

		return sign === expect
	}
	private createSign(str: string) {
		return crypto
			.createHmac('sha256', this.cfg.sharedSecret)
			.update(str)
			.digest('hex')
	}
}
