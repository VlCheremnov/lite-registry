import { Test, TestingModule } from '@nestjs/testing'
import { ServicesService } from './services.service'
import { ServiceStateStore } from '@lib/gossip/store/service-state.store'
import { DigestHandler } from '@lib/gossip/handler/digest.handler'

describe('GossipService', () => {
	let service: ServicesService

	const mockStore = {
		get getServices() {
			return ['a', 'b', 'c']
		},
		getFilteredServices: jest.fn().mockReturnValue(['a', 'c']),
	}

	const mockDigest = {
		upsertLocalService: jest.fn().mockReturnValue({ ok: true }),
	}

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [ServicesService],
		})
			.useMocker((token) => {
				if (token === ServiceStateStore) {
					return mockStore
				}
				if (token === DigestHandler) {
					return mockDigest
				}
				return {}
			})
			.compile()

		service = module.get<ServicesService>(ServicesService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	it('getServices(ids) → вызывает store.getFilteredServices', () => {
		expect(service.getServices(['a', 'b'])).toEqual(
			mockStore.getFilteredServices()
		)
	})

	it('getServices() → вызывает store.getServices', () => {
		expect(service.getServices()).toEqual(mockStore.getServices)
	})

	it('upsertLocalService → делегирует digestHandler', () => {
		const record = { id: 'a', host: 'localhost', name: 'api' }

		expect(service.upsertLocalService(record)).toEqual({ ok: true })
	})
})
