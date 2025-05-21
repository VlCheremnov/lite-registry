import { Body, Controller, Post } from '@nestjs/common'
import { ServicesService } from './services.service'
import { CreateServiceDto } from './dto/create-service.dto'

@Controller()
export class ServicesController {
	constructor(private readonly agent: ServicesService) {}

	/** Получаем все сервисы */
	@Post('/get-services')
	async getServices() {
		return this.agent.getServices()
	}

	/** Добавить сервис */
	@Post('/upsert-service')
	async UpsertService(@Body() data: CreateServiceDto) {
		return this.agent.upsertLocalService(data)
	}
}
