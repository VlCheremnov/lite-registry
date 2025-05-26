import { IsObject, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateServiceDto {
	@IsString()
	@MinLength(1)
	id: string

	@IsString()
	@MinLength(1)
	name: string

	@IsString()
	@MinLength(1)
	host: string

	@IsOptional()
	@IsObject()
	meta?: Record<string, any>
}
