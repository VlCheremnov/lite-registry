import { Test, TestingModule } from '@nestjs/testing'
import { ServicesController } from './services.controller'
import { ServicesService } from './services.service'
import * as request from 'supertest'
import { INestApplication } from '@nestjs/common'

describe('ServicesController', () => {
	let app: INestApplication
	let controller: ServicesController
	let service: ServicesService

	const mockServices = {
		getServices: jest.fn(),
		upsertLocalService: jest.fn(),
	}

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [ServicesController],
		})
			.useMocker((token) => {
				if (token === ServicesService) {
					return mockServices
				}
				return {}
			})
			.compile()

		controller = module.get<ServicesController>(ServicesController)
		service = module.get<ServicesService>(ServicesService)

		app = module.createNestApplication()
		await app.init()
	})

	it('should be defined', () => {
		expect(controller).toBeDefined()
	})

	it(`/POST get-services`, () => {
		return request(app.getHttpServer()).post('/get-services').expect(201)
	})

	it(`/POST upsert-service`, () => {
		return request(app.getHttpServer()).post('/upsert-service').expect(201)
	})

	afterAll(async () => {
		await app.close()
	})
})
