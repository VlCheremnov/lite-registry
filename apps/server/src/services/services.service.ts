import { Injectable, Logger } from '@nestjs/common'

import { ServiceStateStore } from '@lib/gossip/store/service-state.store'
import { DigestHandler } from '@lib/gossip/handler/digest.handler'
import { ServiceIdType, UpsertLocalServiceType } from '@lib/gossip/types'

@Injectable()
export class ServicesService {
	constructor(
		private readonly store: ServiceStateStore,
		private readonly digestHandler: DigestHandler
	) {}

	public getServices(recordsIds?: ServiceIdType[]) {
		if (recordsIds) {
			return this.store.getFilteredServices(recordsIds)
		} else {
			return this.store.getServices
		}
	}

	public upsertLocalService(record: UpsertLocalServiceType) {
		return this.digestHandler.upsertLocalService(record)
	}
}
