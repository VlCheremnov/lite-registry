import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ServiceRecordStateEnum } from '../enums'
import { ServiceStateStore } from '../store/service-state.store'
import { ServiceIdType, ServiceRecordType } from '@lib/gossip/types'
import { ServicesService } from '../../../../apps/server/src/services/services.service'
import { GossipTransport } from '@lib/gossip/transport/gossip.transport'

@Injectable()
export class HeartbeatMonitor implements OnModuleInit, OnModuleDestroy {
	private timer: NodeJS.Timeout | null = null

	/* todo: Вынести в конфиги */
	private readonly heartbeatIntervalMs = 2_000
	private readonly maxGossipIntervalMs = 11_000

	constructor(
		private readonly store: ServiceStateStore,
		private readonly transport: GossipTransport
	) {}

	/** Стартуем периодический цикл */
	onModuleInit() {
		this.startHeartbeatInterval()
	}

	/** Удаляем таймер */
	onModuleDestroy() {
		if (this.timer) clearTimeout(this.timer)
	}

	/** Запуск проверки сервисов */
	private startHeartbeatInterval() {
		this.timer = setTimeout(async () => {
			await this.validateHeartbeat()

			this.startHeartbeatInterval()
		}, this.getHeartbeatIntervalMs())
	}

	/** Рандомное время для таймера */
	private getHeartbeatIntervalMs() {
		return Math.ceil(this.heartbeatIntervalMs + Math.random() * 500)
	}

	/** Проверяем сервис */
	private async validateHeartbeat() {
		await Promise.allSettled(
			this.store.getServices.map((s) => this.validateHeartbeatService(s))
		)
	}

	/** Проверяем каждый сервис */
	private async validateHeartbeatService(service: ServiceRecordType) {
		if (this.isServiceExpired(service)) {
			if (service.state === ServiceRecordStateEnum.Alive)
				this.setSuspectStatus(service)
			else if (service.state === ServiceRecordStateEnum.Suspect) {
				if (await this.checkHealth(service.id)) {
					this.changeOwner(service)
				} else {
					this.store.removeService(service.id)
				}
			}
		}
	}

	/** Проверка на просроченный сервис  */
	private isServiceExpired(service: ServiceRecordType) {
		return +Date.now() - service.heartbeatTs > this.maxGossipIntervalMs * 3
	}

	/** Меняем овнера */
	private changeOwner(service: ServiceRecordType) {
		this.store.updateService({
			...service,
			sequence: service.sequence + 1,
			generation: service.generation + 1,
			claimTs: +Date.now(),
			ownerId: this.transport.getSelfId,
			state: ServiceRecordStateEnum.Alive,
			heartbeatTs: +Date.now(),
		})
	}

	/** Помечаем сервис просроченным */
	private setSuspectStatus(service: ServiceRecordType) {
		this.store.updateService({
			...service,
			state: ServiceRecordStateEnum.Suspect,
			/* Даем второй шанс и обновляем время в 1.5 раза*/
			heartbeatTs: +Date.now() - this.maxGossipIntervalMs * 1.5,
		})
	}

	/** Проверяем сервис по http */
	private async checkHealth(serviceId: ServiceIdType) {
		return serviceId
	}
}
