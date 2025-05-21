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

		/* Обновленная запись */
		const next: ServiceRecordType = {
			...record,
			version: (service?.version ?? 0) + 1,
			heartbeatTs: +Date.now(),
			ownerId: service?.ownerId ?? this.transport.getSelfId,
			state: ServiceRecordStateEnum.Alive,
			incarnation: 0,
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
			if (service && record.version <= service.version) {
				return
			}

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
			const peerVer = digest[service.id]?.version ?? 0

			if (service.version > peerVer) {
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

	private async updateDigest({
		digest,
		fromId,
	}: {
		digest: GossipReqDigestType
		fromId: string
	}) {
		const { serviceIdsToRefresh, serviceIdsForHeartbeatUpdate } =
			this.compareDigest(digest)

		/* Обновляем heartbeatTs */
		if (serviceIdsForHeartbeatUpdate.length) {
			serviceIdsForHeartbeatUpdate.forEach((serviceId) => {
				const service = this.store.getService(serviceId)!

				this.store.updateService({ ...service, heartbeatTs: +Date.now() })
			})
		}

		/* Запрашивает сервисы и обновляем их */
		if (serviceIdsToRefresh.length) {
			const res = await this.transport.sendMsg<
				GossipReqFetchRecordsType,
				ServiceRecordType[]
			>({
				data: serviceIdsToRefresh,
				peerId: fromId,
				type: TransportType.GossipFetchServices,
			})

			const fetchServices = res?.payload || []

			if (!fetchServices.length) {
				this.logger.error('Services not found')
				return
			}

			this.mergeServices(fetchServices)
		}
	}

	/** Сравниваем версии */
	private compareDigest(digest: GossipReqDigestType) {
		const serviceIdsToRefresh: ServiceIdType[] = []
		const serviceIdsForHeartbeatUpdate: ServiceIdType[] = []

		for (const [
			serviceId,
			{ version: digestVersion, incarnation: digestIncarnation },
		] of Object.entries(digest)) {
			const service = this.store.getService(serviceId)

			const serviceVersion = service?.version ?? 0
			const serviceIncarnation = service?.incarnation ?? 0

			/* Обновляем heartbeatTs */
			if (
				service &&
				digestIncarnation > serviceIncarnation &&
				digestVersion > serviceVersion
			) {
				serviceIdsForHeartbeatUpdate.push(serviceId)
			}

			/* Записывает устаревшую версию */
			if (digestVersion > serviceVersion) {
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
