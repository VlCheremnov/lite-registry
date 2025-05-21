import { Module } from '@nestjs/common'
import { GossipService } from './gossip.service'
import { GossipController } from '@lib/gossip/gossip.controller'
import { GossipScheduler } from '@lib/gossip/scheduler/gossip.scheduler'
import { HeartbeatMonitor } from '@lib/gossip/scheduler/heartbeat.monitor'
import { ServiceStateStore } from '@lib/gossip/store/service-state.store'
import { GossipTransport } from '@lib/gossip/transport/gossip.transport'
import { DigestHandler } from '@lib/gossip/handler/digest.handler'

@Module({
	controllers: [GossipController],
	providers: [
		GossipService,
		GossipScheduler,
		HeartbeatMonitor,
		ServiceStateStore,
		GossipTransport,
		DigestHandler,
	],
	exports: [GossipService, ServiceStateStore, DigestHandler],
})
export class GossipModule {}
