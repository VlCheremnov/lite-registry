import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ServiceRecordStateEnum } from '../enums'
import { ServiceStateStore } from '../store/service-state.store'

@Injectable()
export class HeartbeatMonitor implements OnModuleInit, OnModuleDestroy {
	private timer: NodeJS.Timeout | null = null

	/* todo: Вынести в конфиги */
	private readonly heartbeatIntervalMs = 2_000
	private readonly maxGossipIntervalMs = 11_000

	constructor(private readonly store: ServiceStateStore) {}

	/** Стартуем периодический цикл */
	onModuleInit() {
		this.startHeartbeatInterval()
	}

	/** Удаляем таймер */
	onModuleDestroy() {
		if (this.timer) clearInterval(this.timer)
	}

	/** Запуск проверки сервисов */
	private startHeartbeatInterval() {
		this.timer = setInterval(
			this.validateHeartbeat.bind(this),
			this.heartbeatIntervalMs
		)
	}

	/** Проверяем сервис */
	private validateHeartbeat() {
		this.store.getServices.forEach((service) => {
			if (+Date.now() - service.heartbeatTs > this.maxGossipIntervalMs * 3) {
				if (service.state === ServiceRecordStateEnum.Alive) {
					this.store.updateService({
						...service,
						state: ServiceRecordStateEnum.Suspect,
						/* Даем второй шанс и обновляем время в 1.5 раза*/
						heartbeatTs: +Date.now() - this.maxGossipIntervalMs * 1.5,
					})
				} else if (service.state === ServiceRecordStateEnum.Suspect) {
					/* todo: Попробовать переназначить сервис на себя */
					this.store.removeService(service.id)
				}
			}
		})
	}
}
