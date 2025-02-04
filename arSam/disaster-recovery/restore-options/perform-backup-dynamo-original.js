const { DateTime } = require('luxon');
const { opDynamoBackup } = require('../operations/op-dynamo-backup');

const config = require('../config');
const { dynamoInputType } = config;

const operations = require('../operations');
const { backupDynamoOG } = operations;

/**
 * Initiates the process for backing up a table in DynamoDB.
 *
 * @param   {Object} ops - operations object containing various AWS operations
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for backupDynamoOG
 *
 */
async function performBackupOriginal(ops, chosenTable) {
  // Operation required for this process
  ops.backupDynamoOG = backupDynamoOG;

  try {
    let dateTime = DateTime.now().toFormat(dynamoInputType);

    // Set the backupDynamoOG operation
    ops.backupDynamoOG.sourceTable = chosenTable;
    ops.backupDynamoOG.backupName = `${chosenTable}--orig-${dateTime}`;
    ops.backupDynamoOG.message = `\n💾  BACKING UP [${ops.backupDynamoOG.sourceTable}] as [${ops.backupDynamoOG.backupName}]...`;

    // Start the backup process
    ops.backupDynamoOG = await opDynamoBackup(ops.backupDynamoOG);
  } catch (error) {
    ops.backupDynamoOG.opStatus = 'failed';
    ops.backupDynamoOG.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performBackupOriginal };
