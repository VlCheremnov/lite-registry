import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator'

export class CreateServiceDto {
	@IsString()
	id: string

	@IsString()
	name: string

	@IsString()
	host: string

	@IsOptional()
	@IsObject()
	meta?: Record<string, any>
}
