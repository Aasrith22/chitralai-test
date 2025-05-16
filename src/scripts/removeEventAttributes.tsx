import { removeAttributesFromAllEvents } from '../config/eventStorage';

/**
 * Script to remove the following attributes from all events in DynamoDB:
 * - Count
 * - eventCoverURL
 * - eventName
 * - guestCount
 * 
 * Run this script using:
 * npx ts-node src/scripts/removeEventAttributes.tsx
 */
async function main() {
  console.log('Starting attribute removal process for events...');
  
  try {
    const result = await removeAttributesFromAllEvents();
    
    console.log('Attribute removal process completed.');
    console.log(`Summary: Successfully processed ${result.success} events, Failed: ${result.failed}`);
    
    if (result.failed > 0) {
      console.log('Some events failed processing. Check the logs for details.');
    }
  } catch (error) {
    console.error('Error running attribute removal process:', error);
  }
}

// Run the script
main().catch(console.error); 