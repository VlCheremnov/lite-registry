import { ServiceRecordStateEnum } from '../enums'

export type ServiceIdType = string

export interface ServiceRecordType {
	id: ServiceIdType // уникальный id сервиса (например, UUID)
	name: string // “orders-api”, “auth-service” и т.д.
	version: number // монотонно растущая версия записи
	host: string // host:port
	ownerId: string
	meta?: Record<string, any> // любые дополнительные поля
	heartbeatTs: number
	incarnation: number
	state: ServiceRecordStateEnum
}

export type UpsertLocalServiceType = Omit<
	ServiceRecordType,
	'ownerId' | 'version' | 'heartbeatTs' | 'incarnation' | 'state'
>

export type DigestType = Record<
	string,
	{ version: number; incarnation: number }
>

/** Оболочка Gossip-сообщения */
export type GossipReqDigestType = DigestType

/** полный массив изменённых/новых записей */
export type GossipReqRecordsType = ServiceRecordType[]

/** полный массив изменённых/новых записей */
export type GossipReqFetchRecordsType = ServiceIdType[]

/** Делаем поля опциональными */
export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
	Partial<Pick<T, K>>
