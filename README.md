# CloudFlare Rate-Limiting like service proof-of-concept implemented using RLN and InterRep (WIP)

### Prerequisites

1. Docker and docker-compose, for the MongoDb database.

### Install instructions 

1. `yarn`

### Startup instructions

1. Start the DB and the DB explorer containers:
`docker-compose up -d`,

Then run the apps:

1. `yarn interrepMock`
2. `yarn server`
3. `yarn appExample`
4. `yarn client`


### Description

This repo contains a PoC application for a CloudFlare-like rate limiting service implemented using the RLN construct and the InterRep linking service. The idea is that users already registered to InterRep (their identity commitment being added to some of the semaphore groups) can access applications protected by the RateLimiting service. If the users are cought spamming, then they will be "banned" from all of the applications protected by the service, by the properties of the RLN protocol. The users will not be slashed and will not be removed from the semaphore groups, but they will not be able to generate valid RLN proofs, and thus access the applications.

This is a simple PoC, and much more advanced rate limiting logic can be applied (i.e request limiting and proof generation based on more advanced heuristics), but the purpose of the PoC is how RLN can be applied and used for these kind of apps.

There are 4 different components:

- InterRep (web2 to web3 account linking service with privacy properties), serves as access permit
- Rate limiting service - rate limiting middleware between the users and the appps
- Apps - applications protected by the Rate limiting service (need to register to the rate limiting service for protection first)
- Users

The rate limiting service synchronizes the membership tree from the InterRep service, and it holds the same tree. Currently a mock app for the InterRep service is used that stores just a single semaphore group, but once there are InterRep APIs that expose the state of the trees for the semaphore groups those endpoints will be used instead. The synchronization will hapen once a new user is registered to interrep (can be tracked via smart contract event), and on the first service initialization (when the tree is not initialized at the rate limiting service).
The rate limiting service keeps a list of valid tree roots. Once a user is banned, a new root is obtained by simulating a user removal from the tree (zeroing out the leaf for that user). If the banned user tries to send new request, they will be blocked by the rate limiting service, because their proof will be invalid. The state of the tree is the same as the tree in InterRep in order to allow for interoperability, and the tree roots are really what we need for proper proof verification.


For more details around the idea, please refer to: https://ethresear.ch/t/decentralised-cloudflare-using-rln-and-rich-user-identities/10774