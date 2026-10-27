// Wire format for /api/sync, shared by the app and tests.
import { maxStamp,                               } from './merge.js';

                             
           
             
            
            
           
 

                             
           
            
                  
 

                               
                   
                 
                
                     
                        
 

export const toChange = (t       , r              )             => ({ t, id: r.id, d: JSON.stringify(r), h: maxStamp(r), x: r.deleted ? 1 : 0 });

/** Sync keys: 30 random characters from an unambiguous alphabet, shown in groups of five. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newSyncKey()         {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return chars.match(/.{5}/g) .join('-');
}
