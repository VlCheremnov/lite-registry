import { Controller } from '@nestjs/common'
import { GossipService } from './gossip.service'
import { Data, FromId, TcpEvent } from '@lib/tcp-transport/decorators'
import { TransportType } from './enums'
import {
	GossipReqDigestType,
	GossipReqFetchRecordsType,
	GossipReqRecordsType,
} from './types'

@Controller()
export class GossipController {
	constructor(private readonly gossip: GossipService) {}

	/** Обрабатываем дайджест от агента */
	@TcpEvent(TransportType.GossipDigest)
	GossipDigest(@Data() digest: GossipReqDigestType, @FromId() fromId: string) {
		return this.gossip.processDigest(digest, fromId)
	}

	/** Получаем сервисы для мержа от агента */
	@TcpEvent(TransportType.GossipMergeRecords)
	GossipMergeRecord(@Data() records: GossipReqRecordsType) {
		this.gossip.mergeServices(records)
	}

	/** Отдаем запрашиваемые сервисы */
	@TcpEvent(TransportType.GossipFetchServices)
	GossipFetchServices(@Data() recordIds: GossipReqFetchRecordsType) {
		return this.gossip.getServices(recordIds)
	}
}
