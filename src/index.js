const { EventHubConsumerClient } = require("@azure/event-hubs");

const { ContainerClient } = require("@azure/storage-blob");
const { BlobCheckpointStore } = require("@azure/eventhubs-checkpointstore-blob");

const connectionString = process.env.ehConnectionString;
const eventHubName = process.env.ehName;
const storageConnectionString = process.env.storageConnectionString
const containerName = process.env.containerName;
const consumerGroup = process.env.consumerGroup;

process.setMaxListeners(0);

exports.process = async(event, context) => {
    await main();
};

async function main() {

    const containerClient = new ContainerClient(storageConnectionString, containerName);

    if (!(await containerClient.exists())) {
        await containerClient.create();
    }

    const checkpointStore = new BlobCheckpointStore(containerClient);

    const consumerClient = new EventHubConsumerClient(
        consumerGroup,
        connectionString,
        eventHubName,
        checkpointStore
    );

    const subscription = consumerClient.subscribe({
        processEvents: async(events, context) => {
            if (events.length === 0) {
                // If the wait time expires (configured via options in maxWaitTimeInSeconds) Event Hubs
                // will pass you an empty array.
                return;
            }

            for (const event of events) {
                console.log('received events');
                console.log(
                    `Received event: '${event.body}' from partition: '${context.partitionId}' and consumer group: '${context.consumerGroup}'`
                );
            }

            try {
                // save a checkpoint for the last event now that we've processed this batch.
                await context.updateCheckpoint(events[events.length - 1]);
            } catch (err) {
                console.log(`Error when checkpointing on partition ${context.partitionId}: `, err);
                throw err;
            }

            console.log(
                `Successfully checkpointed event with sequence number: ${
          events[events.length - 1].sequenceNumber
        } from partition: ${context.partitionId}`
            );
        },
        processError: async(err, context) => {
            console.log(`Error : ${err}`);
        }
    });

    // after 30 seconds, stop processing
    await new Promise((resolve) => {
        setTimeout(async() => {
            console.log('shutting down');
            await subscription.close();
            await consumerClient.close();
            resolve();
        }, 110000);
    });
}

main().catch((err) => {
    console.log("Error occurred: ", err);
});