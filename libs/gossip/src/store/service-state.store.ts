import { Injectable, Logger } from '@nestjs/common'
import {
	DigestType,
	ServiceIdType,
	ServiceRecordType,
	UpsertLocalServiceType,
} from '../types'
import { ServiceRecordStateEnum } from '../enums'
// import { servicesDB } from '@lib/database'

@Injectable()
export class ServiceStateStore {
	private readonly logger = new Logger(ServiceStateStore.name)

	/** Локальный кэш */
	private readonly state = new Map<ServiceIdType, ServiceRecordType>()

	constructor() {}

	/** Получить сервис по id */
	public getService(id: ServiceIdType) {
		return this.state.get(id)
	}

	/** Получить карту сервисов */
	public get getState() {
		return this.state
	}

	/** Получить список всех живых сервисов */
	public get getServices() {
		return Array.from(this.state.values()).filter(
			({ state }) => state !== ServiceRecordStateEnum.Dead
		)
	}

	/** Получить отфильтрованный список сервисов */
	public getFilteredServices(recordsIds: ServiceIdType[]) {
		return this.getServices.filter(({ id }) => recordsIds.includes(id))
	}

	/** Обновляем сервис*/
	public updateService(service: ServiceRecordType) {
		this.state.set(service.id, service)
	}

	/** Удаляем сервис */
	public removeService(serviceId: ServiceIdType) {
		// this.state.delete(service.id)
		const service = this.getService(serviceId)

		if (!service) {
			return
		}

		this.updateService({ ...service, state: ServiceRecordStateEnum.Dead })
	}
}
