import { plainToInstance } from 'class-transformer'
import { CreateServiceDto } from './create-service.dto'
import { validate } from 'class-validator'
import { faker } from '@faker-js/faker'

type InvalidCaseType = Array<[string, Partial<any>, RegExp]>

const createInvalidCases = (key: string): InvalidCaseType => {
	const defaultService = { name: 'api', host: 'localhost', id: '1-2-3-4' }

	return [
		[
			`${key} пустое`,
			{ ...defaultService, [key]: '' },
			new RegExp(`${key} must be longer`, 'i'),
		],
		[
			`${key} не объявлено`,
			{ ...defaultService, [key]: undefined },
			new RegExp(`${key} must be a string`, 'i'),
		],
	]
}

const invalid: InvalidCaseType = [
	...createInvalidCases('name'),
	...createInvalidCases('id'),
	...createInvalidCases('host'),
]

const valid: CreateServiceDto[] = [
	{ name: 'api', host: 'localhost', id: '1-2-3' },
	{ name: 'metrics', host: '127.0.0.1', id: 'abc' },
	{ name: 'metrics', host: '127.0.0.1', id: 'abc', meta: { test: true } },
]

describe('CreateServiceDto', () => {
	it.each(invalid)('400, если %s', async (_, payload, pattern) => {
		const errors = await validate(plainToInstance(CreateServiceDto, payload))
		const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}))
		expect(messages.join(' | ')).toMatch(pattern)
	})

	it.each(valid)('pass valid dto %#', async (dto) => {
		const errors = await validate(plainToInstance(CreateServiceDto, dto))
		expect(errors).toHaveLength(0)
	})

	it('random valid dto passes', async () => {
		faker.seed(42)
		const dto = {
			name: faker.word.sample(),
			host: faker.internet.domainName(),
			id: faker.string.uuid(),
		}
		const errors = await validate(plainToInstance(CreateServiceDto, dto))
		expect(errors).toHaveLength(0)
	})
})
