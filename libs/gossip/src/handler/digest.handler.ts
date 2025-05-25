import { Injectable, Logger } from '@nestjs/common'
import {
	GossipReqDigestType,
	GossipReqFetchRecordsType,
	GossipReqRecordsType,
	ServiceIdType,
	ServiceRecordType,
	UpsertLocalServiceType,
} from '../types'
import { ServiceRecordStateEnum, TransportType } from '../enums'
import { GossipTransport } from '../transport/gossip.transport'
import { ServiceStateStore } from '../store/service-state.store'

@Injectable()
export class DigestHandler {
	private readonly logger = new Logger(DigestHandler.name)
	constructor(
		private readonly transport: GossipTransport,
		private readonly store: ServiceStateStore
	) {}

	/** Регистрируем / обновляем собственный сервис в локальном состоянии */
	public upsertLocalService(record: UpsertLocalServiceType) {
		const service = record.id ? this.store.getService(record.id) : null

		/* Запрещаем редактирование чужого сервиса */
		if (service && service.ownerId !== this.transport.getSelfId) {
			return this.logger.error('Сервис принадлежит другому агенту!')
		}

		/* todo: Перенести */
		const sequence = service ? service.sequence + 1 : 0

		/* Обновленная запись */
		const next: ServiceRecordType = {
			...record,
			version: (service?.version ?? 0) + 1,
			heartbeatTs: +Date.now(),
			ownerId: service?.ownerId ?? this.transport.getSelfId,
			state: ServiceRecordStateEnum.Alive,
			generation: service?.generation ?? 0,
			sequence,
			/* Заполняем 1 раз только при создании сервиса или изменении овнера */
			claimTs: service?.claimTs ?? +Date.now(),
		}

		this.store.updateService(next)

		this.logger.debug(
			`Local service "${next.host}" updated/create → version ${next.version}`
		)
	}

	/** Обновляем/регистрируем сервисы пришедшие из других агентов  */
	public mergeServices(records: ServiceRecordType[]) {
		records.forEach((record) => {
			const service = this.store.getService(record.id)

			/* Делаем проверку, что текущий сервис меньшей версии */
			if (service && record.version < service.version) {
				return
			}

			// if (remote.incarnation !== local.incarnation)
			//   return remote.incarnation > local.incarnation
			//
			// if (remote.version !== local.version)
			//   return remote.version > local.version
			//
			// if (remote.claimTs !== local.claimTs)
			//   return remote.claimTs < local.claimTs   // «старше» – тот, кто первым заявил
			//
			// return remote.ownerId > local.ownerId      // детерминируем спор

			const update: ServiceRecordType = {
				...record,
				heartbeatTs: service?.heartbeatTs ?? +Date.now(),
			}

			this.store.updateService(update)
		})
	}

	/** Сравниваем версии: собираем то, что у нас свежее */
	private async sendDelta({
		digest,
		fromId,
	}: {
		digest: GossipReqDigestType
		fromId: string
	}) {
		const delta: ServiceRecordType[] = []

		this.store.getServices.forEach((service) => {
			const { generation = 0, version = 0 } = digest[service.id] || {}

			if (service.generation > generation || service.version > version) {
				/* Отправляем все кроме временной метки */
				delta.push(service)
			}
		})

		/* Если у агента есть версии свежее отправляем обратно */
		if (delta.length) {
			await this.transport.sendMsg<GossipReqRecordsType>({
				data: delta,
				peerId: fromId,
				type: TransportType.GossipMergeRecords,
			})
		}
	}

	/** обновляем сервисы по digest */
	private async updateDigest({
		digest,
		fromId,
	}: {
		digest: GossipReqDigestType
		fromId: string
	}) {
		const { serviceIdsToRefresh, serviceIdsForHeartbeatUpdate } =
			this.compareDigest(digest)

		this.updateHeartbeat(serviceIdsForHeartbeatUpdate)

		const services = await this.fetchServices(serviceIdsToRefresh, fromId)
		this.mergeServices(services)
	}

	/** Запрашиваем сервисы */
	private async fetchServices(serviceIds: ServiceIdType[], fromId: string) {
		if (!serviceIds.length) {
			return []
		}

		const res = await this.transport.sendMsg<
			GossipReqFetchRecordsType,
			ServiceRecordType[]
		>({
			data: serviceIds,
			peerId: fromId,
			type: TransportType.GossipFetchServices,
		})

		const services = res?.payload || []

		if (!services.length) {
			this.logger.error('Services not found')
		}

		return services
	}

	/** Обновляем таймер жизни */
	private updateHeartbeat(serviceIds: ServiceIdType[]) {
		if (serviceIds.length) {
			serviceIds.forEach((serviceId) => {
				const service = this.store.getService(serviceId)!

				this.store.updateService({ ...service, heartbeatTs: +Date.now() })
			})
		}
	}

	/** Сравниваем версии */
	private compareDigest(digest: GossipReqDigestType) {
		const serviceIdsToRefresh: ServiceIdType[] = []
		const serviceIdsForHeartbeatUpdate: ServiceIdType[] = []

		for (const [
			serviceId,
			{
				version: digestVersion,
				generation: digestGeneration,
				sequence: digestSequence,
			},
		] of Object.entries(digest)) {
			const service = this.store.getService(serviceId)

			const serviceVersion = service?.version ?? 0
			const serviceGeneration = service?.generation ?? 0
			const serviceSequence = service?.sequence ?? 0

			/* Обновляем heartbeatTs */
			if (
				service &&
				(digestSequence > serviceSequence ||
					digestGeneration > serviceGeneration ||
					digestVersion > serviceVersion)
			) {
				serviceIdsForHeartbeatUpdate.push(serviceId)
			}

			/* Записывает устаревшую версию */
			if (
				digestGeneration > serviceGeneration ||
				digestVersion > serviceVersion
			) {
				serviceIdsToRefresh.push(serviceId)
			}
		}

		return { serviceIdsToRefresh, serviceIdsForHeartbeatUpdate }
	}

	/**
	 * Получаем digest соседа и отвечаем данными, если у нас есть более новая версия
	 * */
	public async processDigest(data: {
		digest: GossipReqDigestType
		fromId: string
	}) {
		await Promise.all([this.sendDelta(data), this.updateDigest(data)])
	}
}
