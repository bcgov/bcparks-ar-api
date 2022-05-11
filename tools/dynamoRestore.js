const AWS = require('aws-sdk');

const data = require('./dump.json');

const TABLE_NAME = process.env.TABLE_NAME || 'ar-tests';

const options = {
  region: 'ca-central-1',
  endpoint: process.env.IS_OFFLINE == 'true' ? 'http://localhost:8000': 'https://dynamodb.ca-central-1.amazonaws.com'
};

console.log("USING CONFIG:", options);

const dynamodb = new AWS.DynamoDB(options);

let action = ["|","/","-","\\"];
let index = 0;

async function run() {
  console.log("Running importer");
  for (const item of data.Items) {
    process.stdout.write(action[index % 4]  + " "  + index.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + "\r");
    index++;
    const itemObj = {
      TableName: TABLE_NAME,
      Item: item
    };
    const res = await dynamodb.putItem(itemObj).promise();
  }
  process.stdout.write(`${index.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Records Processed\r\n`);
}

run();
