const { DateTime } = require('luxon');
const { awsCommand, backToMenuOrExit, getConsoleInput, getNumberInput, lineWrap } = require('../functions');

const { opDynamoRestore } = require('../operations/op-dynamo-restore');

const operations = require('../operations');
const { restoreDynamo } = operations;

/**
 * Carry out the steps to restore a table from DynamoDB Backups
 *
 * @param   {Object} ops - configuration object with all operation settings
 * @returns {Object} returns an updated ops configuration object with newly added
 *                   restoreDynamo item added and updated.
 *
 */
async function performManualRestoreDynamo(ops, chosenTable) {
  // Operation required for this process
  ops.restoreDynamo = restoreDynamo;

  try {
    // Restore process can continue
    // Check that backups exist for the chosen table
    let backups = await awsCommand(['dynamodb', 'list-backups', '--table-name', chosenTable]);

    // Perform steps for DynamoDB Backup if there are backups
    if (backups.BackupSummaries.length > 0) {
      let backupName = await confirmDynamoBackupChoice(chosenTable, backups.BackupSummaries);

      // Set the restoreDynamo operation
      ops.restoreDynamo.backupName = backupName.BackupName;
      ops.restoreDynamo.targetTable = chosenTable;
      ops.restoreDynamo.message = `\n🔄 RESTORING [${chosenTable}] from backup...`;

      // Start the restore process
      ops.restoreDynamo = await opDynamoRestore(ops.restoreDynamo);
    } else {
      // No tables means we need to go back to the main menu
      console.log(
        lineWrap(
          `\n❗ Doesn't look like there are any backups for [${chosenTable}] in DynamoDB. You can look for backups in AWS Backups from the main menu.`
        )
      );
      await backToMenuOrExit();
    }
  } catch (error) {
    ops.restoreDynamo.opStatus = 'failed';
    ops.restoreDynamo.errorMessage = error;
    throw error;
  }

  return ops;
}

/**
 * Let the user decide which backup they would like to restore from DynamoDB Backups.
 *
 * @param   {String} chosenTable - the selected table used to look for backups
 * @param   {Array}  backups - the backups available from DynamoDB Backups
 * @returns {Object} the user-selected object from the backups array
 */
async function confirmDynamoBackupChoice(chosenTable, backups) {
  console.log(`\n🔍 Looking at the Dynamo Backups for [${chosenTable}]...`);
  // Reverse backups as they don't show newest backup first
  backups = backups.reverse();
  // If we have at least one backup, show the items
  if (backups.length > 0) {
    console.log(`\n*-------------------------------*                                   `);
    console.log(`|  💾 CHOOSE A BACKUP 💾        |                                   `);
    console.log(`|------------------------------------------------------------------*`);
    console.log('|  Backup #  |  Date                    |  Backup Name             |');
    console.log(`|------------------------------------------------------------------|`);
    for (let i = 0; i < backups.length; i++) {
      // Make sure the backups are completed and match table
      if (backups[i].BackupStatus === 'AVAILABLE' && backups[i].TableName === chosenTable) {
        let dateTime = DateTime.fromISO(backups[i].BackupCreationDateTime).toFormat('LLL dd yyyy - HH:mm:ss');
        let backupName = backups[i].BackupName;
        let backupNameLength = backups[i].BackupName.length;
        backupName = backupNameLength >= 24 ? backupName.slice(0, 21) + '...' : backupName;

        space = i < 9 ? '  ' : ' ';
        console.log(`|     ${i + 1}${space}    |  ${dateTime}  |  ${backupName}|`);
      }
    }
    console.log(`*------------------------------------------------------------------*`);
  }

  // User selects the backup they want to provide for restore
  let chosenBackup = await getNumberInput(`\n💾 Which [${chosenTable}] backup would you like to restore from?`, [
    backups.length
  ]);

  let chosenBackupNumber = DateTime.fromISO(backups[chosenBackup - 1].BackupCreationDateTime).toFormat(
    'LLL dd yyyy - HH:mm:ss'
  );
  let confirmBackup = await getConsoleInput(
    `\n⭐ Confirm you want to restore [${chosenTable}] from [${chosenBackupNumber}] and continue?`,
    ['y', 'n']
  );

  // User changes their mind on which backup they want to use
  if (confirmBackup == 'n') {
    chosenBackup = await confirmDynamoBackupChoice(chosenTable, backups);
  }

  return backups[chosenBackup - 1];
}

module.exports = { performManualRestoreDynamo };
