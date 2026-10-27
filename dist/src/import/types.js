                                                                                            

                              
       
                 
                              
                  
                          
                        
                    
            
                           
                  
                
 

                               
                                   
                   
                      
                      
                   
                        
                         
                              
                        
                                 
 

export const TIME_ZONE = 'America/New_York';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Local calendar date (YYYY-MM-DD) of a UTC instant in the user's time zone. */
export const localDate = (isoUtc        )         => fmt.format(new Date(isoUtc));
