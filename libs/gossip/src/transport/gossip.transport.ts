import { Injectable, Logger } from '@nestjs/common'
import { TcpTransport } from '@lib/tcp-transport'
import { TransportType } from '../enums'
import { TcpResponse } from '@lib/tcp-transport/types'

@Injectable()
export class GossipTransport {
	private readonly logger = new Logger(GossipTransport.name)

	constructor(private readonly tcp: TcpTransport) {}

	/** ID текущего узла */
	public get getSelfId() {
		return this.tcp.getSelfPeer.id
	}

	/** Получаем рандомный узел */
	public getRandomPeer() {
		const peerLength = this.tcp.getOtherPeers.length

		if (!peerLength) return

		const randomIndex = Math.floor(Math.random() * peerLength)

		return this.tcp.getOtherPeers[randomIndex]
	}

	/** Отправить сообщение */
	public async sendMsg<Data extends object | unknown[] | undefined, Res = any>({
		data,
		peerId,
		type,
	}: {
		data: Data
		peerId: string
		type: TransportType
	}): Promise<TcpResponse<Res> | undefined> {
		try {
			const res = await this.tcp.sendToPeer(peerId, { type, data })
			this.logger.debug(`→ "${type}" отправлен peer=${peerId}.`)

			return res
		} catch (e) {
			this.logger.error(
				`Не удалось отправить "${type}" на peer=${peerId}: ${e}`
			)
		}
	}
}
