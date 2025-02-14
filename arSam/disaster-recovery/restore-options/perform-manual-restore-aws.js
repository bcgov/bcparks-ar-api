const { DateTime } = require('luxon');
const { awsCommand, backToMenuOrExit, getConsoleInput, getNumberInput, lineWrap } = require('../functions');

const { opAWSRestore } = require('../operations/op-aws-backup-restore');

const config = require('../config');
const { vaultName } = config;

const operations = require('../operations');
const { restoreAWS } = operations;

/**
 * Carry out the steps to restore a table from AWS Backups
 *
 * @param   {Object} ops - configuration object with all operation settings
 * @returns {Object} returns an updated ops configuration object with newly added
 *                   restoreAWS item added and updated.
 *
 */
async function performManualRestoreAWS(ops, chosenTable) {
  // Operation required for this process
  ops.restoreAWS = restoreAWS;

  try {
    // Check that backups exist for the chosen table
    let backupsObj = await awsCommand([
      'backup',
      'list-recovery-points-by-backup-vault',
      '--backup-vault-name',
      `${vaultName}`,
      '--by-resource-type',
      'DynamoDB'
    ]);

    // Filter by recovery points where it matches the user's chosen table
    let backups = backupsObj.RecoveryPoints.filter((recoverPoints) => recoverPoints.ResourceName === chosenTable);
    if (backups.length > 0) {
      let chosenBackup = await confirmAWSBackupChoice(chosenTable, backups, true);

      // Set the restoreAWS operation
      ops.restoreAWS.backupObj = chosenBackup;
      ops.restoreAWS.targetTable = chosenTable;
      ops.restoreAWS.message = `\n🔄 RESTORING [${chosenTable}] from backup...`;

      // Start the restore process
      ops.restoreAWS = await opAWSRestore(ops.restoreAWS);
    } else {
      // It may be that a table doesn't have any AWS Backups
      console.log(
        lineWrap(
          `\n❗ Doesn't look like there are any backups for [${chosenTable}] in DynamoDB. You can look for backups in AWS Backups from the main menu.`
        )
      );
      await backToMenuOrExit();
    }
  } catch (error) {
    ops.restoreAWS.opStatus = 'failed';
    ops.restoreAWS.errorMessage = error;
    throw error;
  }

  return ops;
}

/**
 * Let the user decide which backup they would like to restore from AWS Backups.
 *
 * @param   {String} chosenTable - the selected table used to look for backups
 * @param   {Array}  backups - the backups available from AWS Backups
 * @param   {String} manual - a flag to discern if this is a manual backup or part of
 *                   the AWS Backup Snapshot process. Only difference is console log at
 *                   the end of the function.
 * @returns {Object} the user-selected object from the backups array
 */
async function confirmAWSBackupChoice(chosenTable, backups, manual = true) {
  let currentTime = DateTime.now().toISO();
  console.log(`\n🔍 Looking at the AWS Backups for [${chosenTable}]...`);

  // Continue asking the user until they've decided on a backup choice.
  while (true) {
    console.log(`\n*-------------------------------*                                   `);
    console.log(`|  💾 CHOOSE A BACKUP 💾        |                                   `);
    console.log(`|------------------------------------------------------------------*`);
    console.log('|  Backup # |  Date         |  Name                     |  Storage |');
    console.log(`|------------------------------------------------------------------|`);

    for (let i = 0; i < backups.length; i++) {
      // Make sure the backups are completed and match table
      if (backups[i].Status === 'COMPLETED' && backups[i].ResourceName === chosenTable) {
        let dateTime = DateTime.fromISO(backups[i].CompletionDate).toFormat('LLL dd yyyy');
        let resource = backups[i].ResourceName;
        let resourceLength = resource.length;
        // Trim resource names that are too long
        resource = resourceLength >= 25 ? resource.slice(0, 21) + '...' : resource;

        // Share if it's cold or warm storage
        let storageType = '-';
        let coldStorageTime = backups[i].CalculatedLifecycle.MoveToColdStorageAt;
        if (coldStorageTime < currentTime) {
          storageType = 'Cold ⛄';
        } else {
          storageType = 'Warm 🔥';
        }

        console.log(
          `|     ${i + 1}     |  ${dateTime}  |  ${resource}${Array(
            25 - (resourceLength < 25 ? resourceLength : 24)
          ).join(' ')} |  ${storageType} |`
        );
      } else {
        console.log(`  No backups available for [${chosenTable}]!`);
        console.log(`|------------------------------------------------------------------|`);
        console.log('|  Try rerunning the script. 👋 Exiting...');
        console.log(`*------------------------------------------------------------------*`);
        exit();
      }
    }
    console.log(`|------------------------------------------------------------------|`);
    console.log(`| ⛄ Cold storage type takes -SIGNIFICANTLY- longer to restore ⛄  |`);
    console.log(`*------------------------------------------------------------------*`);

    // User selects the backup they want to provide for restore
    let chosenBackup = await getNumberInput(`\n💾 Which [${chosenTable}] backup would you like to restore from?`, [
      backups.length
    ]);

    // Warn users about cold storage restore times
    let coldStorageTime = backups[chosenBackup - 1].CalculatedLifecycle.MoveToColdStorageAt;
    if (coldStorageTime < currentTime) {
      confirmedColdStorage = await getConsoleInput(
        `\n⛄❗ Please note that restore from cold storage can take SEVERAL hours - continue?`,
        ['y', 'n']
      );

      // User changes their mind on which backup they want to use
      if (confirmedColdStorage == 'n') {
        console.log('Please select another backup.');
        continue;
      }
    }

    // Confirm they want to continue with this restore choice
    let chosenBackupNumber = DateTime.fromISO(backups[chosenBackup - 1].CompletionDate).toFormat('LLL dd yyyy');
    let confirmBackup = await getConsoleInput(
      `\n⭐ Confirm you want to restore [${chosenTable}] from [${chosenBackupNumber}] and continue?`,
      ['y', 'n']
    );

    // User changes their mind on which backup they want to use
    if (confirmBackup == 'n') {
      console.log('Please select another backup.');
      continue;
    }

    return backups[chosenBackup - 1];
  }
}

module.exports = { performManualRestoreAWS };
