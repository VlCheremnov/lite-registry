import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { TcpTransport } from '@lib/tcp-transport'
import { ConsoleLogger, ValidationPipe } from '@nestjs/common'

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: new ConsoleLogger({
			timestamp: true,
			compact: false,
		}),
	})

	app.useGlobalPipes(new ValidationPipe())

	const transport = app.get(TcpTransport)
	app.connectMicroservice({ strategy: transport })
	await app.startAllMicroservices()

	await app.listen(80)
}
bootstrap()
