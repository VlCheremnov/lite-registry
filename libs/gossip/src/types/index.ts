import { ServiceRecordStateEnum } from '../enums'

/** ID сервиса */
export type ServiceIdType = string

/** Сервиса */
export interface ServiceRecordType {
	id: ServiceIdType // уникальный id сервиса (например, UUID)
	name: string // “orders-api”, “auth-service” и т.д.
	version: number // монотонно растущая версия записи
	host: string // host:port
	ownerId: string
	meta?: Record<string, any> // любые дополнительные поля

	// Время +Date.now(), обновляет состояние сервиса
	heartbeatTs: number
	// Счетчик heartbeat, служит для обновления таймаута у других агентов
	sequence: number
	// Поколение записи, меняется при смене ownerId
	generation: number
	// Время создания сервиса, участвует в решении конфликта двух одинаковых сервисов с одним и тем же ownerId
	// Или смене лидера у двух и более сервисов
	claimTs: number
	/* Текущее состояние сервиса у агента */
	state: ServiceRecordStateEnum
}

/** Оболочка для добавления/обновления сервиса */
export type UpsertLocalServiceType = Pick<
	ServiceRecordType,
	'id' | 'name' | 'host' | 'meta'
>

/** Оболочка дайджеста */
export type DigestType = Record<
	ServiceIdType,
	Pick<ServiceRecordType, 'version' | 'generation' | 'sequence' | 'claimTs'>
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
