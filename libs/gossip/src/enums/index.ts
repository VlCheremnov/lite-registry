import { ServiceRecordType } from '../types'

export enum TransportType {
	GossipDigest = 'gossip:digest',
	GossipMergeRecords = 'gossip:merge-records',
	GossipFetchServices = 'gossip:fetch-services',
}

export enum ServiceRecordStateEnum {
	Alive = 'alive',
	Suspect = 'suspect',
	Dead = 'dead',
}
