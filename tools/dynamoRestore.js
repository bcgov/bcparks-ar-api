const AWS = require('aws-sdk');

const data = require('./dump.json');
const { updateConsoleProgress, finishConsoleUpdates, errorConsoleUpdates } = require('./progress-indicator');

const TABLE_NAME = process.env.TABLE_NAME || 'ar-tests';
const MAX_TRANSACTION_SIZE = 25;

const options = {
  region: 'ca-central-1',
  endpoint: process.env.IS_OFFLINE == 'true' ? 'http://localhost:8000' : 'https://dynamodb.ca-central-1.amazonaws.com'
};

console.log("USING CONFIG:", options);

const dynamodb = new AWS.DynamoDB(options);

async function run() {
  console.log("Running importer");
  let startTime = new Date().getTime();
  try {
    for (let i = 0; i < data.Items.length; i += MAX_TRANSACTION_SIZE) {
      updateConsoleProgress(startTime, "Importing", 1, i + 1, data.Items.length);
      let dataChunk = data.Items.slice(i, i + MAX_TRANSACTION_SIZE);
      let batchWriteChunk = { RequestItems: {[TABLE_NAME]: []} };
      for (const item of dataChunk) {
        batchWriteChunk.RequestItems[TABLE_NAME].push({
          PutRequest: {
            Item: item
          }
        });
      }
      await dynamodb.batchWriteItem(batchWriteChunk).promise();
    }
    finishConsoleUpdates();
  } catch (error) {
    errorConsoleUpdates(error);
  }
}

run();
