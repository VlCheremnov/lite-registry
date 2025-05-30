import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { MessagePattern } from '@nestjs/microservices'
import { EventEmitTcpDataType } from '@lib/tcp-transport/types'

/**
 * Проксирует Nest-декоратор MessagePattern
 * и одновременно ограничивает аргумент типом enum.
 */
export function TcpEvent(event: string): MethodDecorator {
	return MessagePattern(event)
}

export const Data = createParamDecorator(
	(_: unknown, ctx: ExecutionContext) => {
		const { data }: EventEmitTcpDataType<any> = ctx.switchToRpc().getData()
		return data
	}
)

export const FromId = createParamDecorator(
	(_: unknown, ctx: ExecutionContext) => {
		const { fromId }: EventEmitTcpDataType<any> = ctx.switchToRpc().getData() // то, что транспорт передал
		return fromId
	}
)
