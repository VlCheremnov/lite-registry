import { Module } from '@nestjs/common'
import { ServicesService } from './services.service'
import { ServicesController } from './services.controller'
import { GossipModule } from '@lib/gossip'

@Module({
	controllers: [ServicesController],
	providers: [ServicesService],
	imports: [GossipModule],
})
export class ServicesModule {}
