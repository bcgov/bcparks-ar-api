const AWS = require('aws-sdk');
const {
  runScan,
  TABLE_NAME,
  dynamoClient,
  marshall,
  unmarshall,
  TransactWriteItemsCommand
} = require('../../layers/baseLayer/baseLayer');
const { getConsoleInput, updateConsoleProgress, clientIDsAR, isTokenExpired } = require('./legacy-data-functions');

const MAX_TRANSACTION_SIZE = 25;

async function run() {
  console.log('********************');
  console.log('PURGE LEGACY ITEMS\n');

  let env;
  let token;

  if (process.argv.length <= 2) {
    console.log('Invalid parameters.');
    console.log('');
    console.log('Usage: node purgeLegacy.js <env>');
    console.log('');
    console.log('Options');
    console.log('    <env>: dev/test/prod');
    console.log('');
    console.log('example: node purgeLegacy.js dev');
    console.log('');
    return;
  } else {
    env = process.argv[2];
    const environment = env === 'prod' ? '' : env + '.';
    const clientID = clientIDsAR[env];
  }

  try {
    const scanObj = {
      TableName: TABLE_NAME,
      FilterExpression: `attribute_exists(legacyMigrationVersion) AND legacyMigrationVersion = :legacyMigrationVersion`,
      ExpressionAttributeValues: {
        ':legacyMigrationVersion': { N: '2' }
      }
    };
    console.log('Scanning database...');
    let db = await runScan(scanObj);

    if (db.length === 0) {
      throw 'No legacy items found.';
    }

    console.log('Legacy items found:', db.length);
    let continueOption = await getConsoleInput(
      `Proceeding will permanently delete all legacy items in the database '${TABLE_NAME}'. Continue? [Y/N] >>> `
    );
    if (continueOption !== 'Y' && continueOption !== 'y') {
      throw `Legacy item purge aborted by user.`;
    }

    // Proceed with deletion:
    // Create transactions:
    let transactionMap = [];
    let transactionMapChunk = { TransactItems: [] };
    let intervalStartTime = new Date().getTime();
    let successes = [];
    let failures = [];
    let removedRoles = [];

    try {
      for (const item of db) {
        updateConsoleProgress(
          intervalStartTime,
          'Creating legacy deletion transaction',
          db.indexOf(item) + 1,
          db.length,
          100
        );
        if (transactionMapChunk.TransactItems.length === MAX_TRANSACTION_SIZE) {
          transactionMap.push(transactionMapChunk);
          transactionMapChunk = { TransactItems: [] };
        }
        const deleteObj = {
          TableName: TABLE_NAME,
          Key: {
            pk: { S: item.pk },
            sk: { S: item.sk }
          }
        };
        transactionMapChunk.TransactItems.push({
          Delete: deleteObj
        });
      }
      if (transactionMapChunk.TransactItems.length) {
        transactionMap.push(transactionMapChunk);
      }
    } catch (error) {
      throw `Error creating deletion transactions: ${error}`;
    }
    process.stdout.write('\n');

    // Execute transactions:
    intervalStartTime = new Date().getTime();
    try {
      for (const transaction of transactionMap) {
        updateConsoleProgress(
          intervalStartTime,
          'Executing legacy deletion transaction',
          transactionMap.indexOf(transaction) + 1,
          transactionMap.length,
          10
        );
        try {
          await dynamoClient.send(new TransactWriteItemsCommand(transaction));
          successes.push(transaction.TransactItems);
        } catch (error) {
          console.log('Execution error:', error);
          failures.push(transaction.TransactItems);
        }
      }
    } catch (error) {
      throw `Error executing deletion transactions: ${error}`;
    }

    process.stdout.write('\n');
    console.log('Deletions complete.\n');
    console.log('********************');
    console.log('DELETION SUMMARY:\n');

    console.log(`${successes.length} legacy items successfully deleted.`);
    console.log(`${removedRoles.length} KC roles successfully deleted.`);
    console.log(`${failures.length} failures encountered.`);

    const viewFailures = await getConsoleInput('Review failures? [Y/N] >>> ');
    if (viewFailures === 'Y' || viewFailures === 'y') {
      console.log('Failures:', Object.entries(failures));
    }
  } catch (error) {
    console.log('ERROR:', error);
  }
}

run();
