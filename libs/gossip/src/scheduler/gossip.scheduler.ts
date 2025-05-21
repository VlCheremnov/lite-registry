import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ServiceStateStore } from '../store/service-state.store'
import { GossipReqDigestType } from '../types'
import { TransportType } from '../enums'
import { GossipTransport } from '../transport/gossip.transport'

@Injectable()
export class GossipScheduler implements OnModuleInit, OnModuleDestroy {
	private timer: NodeJS.Timeout | null = null

	/* todo: Вынести в конфиги */
	private readonly minGossipIntervalMs = 1_000
	private readonly maxGossipIntervalMs = 1_500

	constructor(
		private readonly store: ServiceStateStore,
		private readonly transport: GossipTransport
	) {}

	/** Стартуем периодический цикл */
	onModuleInit() {
		this.startGossipTimer()
	}

	/** Удаляем таймер */
	onModuleDestroy() {
		if (this.timer) clearTimeout(this.timer)
	}

	/** Запуск цикла госсип */
	private startGossipTimer() {
		this.timer = setTimeout(async () => {
			await this.gossipCycle()
			this.startGossipTimer()
		}, this.getRandomGossipInterval())
	}

	/** Получить рандомное время выполнения госсип итерации */
	private getRandomGossipInterval() {
		return Math.ceil(
			this.minGossipIntervalMs +
				Math.random() * (this.maxGossipIntervalMs - this.minGossipIntervalMs)
		)
	}

	/** Выбираем случайного соседа и рассылаем digest */
	private async gossipCycle() {
		const peer = this.transport.getRandomPeer()
		if (!peer) return

		const digest = this.store.getMapVersions

		await this.transport.sendMsg<GossipReqDigestType>({
			data: digest,
			peerId: peer.id,
			type: TransportType.GossipDigest,
		})
	}
}
