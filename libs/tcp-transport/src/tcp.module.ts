import { DynamicModule, Global, Module } from '@nestjs/common'
import { PeerManagementService } from './components/peer-management.service'
import { TcpTransport } from './tcp.transport'
import { TcpModuleAsyncOptions, TcpOptions } from '@lib/tcp-transport/types'
import { DataHandlerService } from '@lib/tcp-transport/components/data-handler.service'
import { ConnectionManagerService } from '@lib/tcp-transport/components/connection-manager.service'

@Global()
@Module({})
export class TcpModule {
	/** Static opts */
	static forRoot(opts: TcpOptions): DynamicModule {
		return {
			module: TcpModule,
			providers: [
				PeerManagementService,
				DataHandlerService,
				ConnectionManagerService,
				{ provide: 'TCP_OPTIONS', useValue: opts },
				TcpTransport,
			],
			exports: [TcpTransport],
		}
	}

	/** Async opts */
	static forRootAsync(options: TcpModuleAsyncOptions): DynamicModule {
		return {
			module: TcpModule,
			imports: options.imports || [],
			providers: [
				PeerManagementService,
				DataHandlerService,
				ConnectionManagerService,
				{
					provide: 'TCP_OPTIONS',
					useFactory: options.useFactory,
					inject: options.inject || [],
				},
				TcpTransport,
			],
			exports: [TcpTransport],
		}
	}
}
