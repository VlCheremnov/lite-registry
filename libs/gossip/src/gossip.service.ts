import { Injectable, Logger } from '@nestjs/common'
import { GossipReqDigestType, ServiceIdType, ServiceRecordType } from './types'
import { ServiceStateStore } from './store/service-state.store'
import { DigestHandler } from './handler/digest.handler'

@Injectable()
export class GossipService {
	/* todo: Решить кейс, что owner может упасть */
	/* todo: Два сервиса могут одновременно зарегистрировать сервис с 1 id*/

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

	public mergeServices(records: ServiceRecordType[]) {
		return this.digestHandler.mergeServices(records)
	}
	public processDigest(digest: GossipReqDigestType, fromId: string) {
		return this.digestHandler.processDigest({ digest, fromId })
	}
}
