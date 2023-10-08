import { onValue, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { database } from './firebase';




function Search() {
    
       const [Query, setQuery] = useState("")
       const [dietaryRestriction, setDietaryRestriction] = useState([])
       const [filteredData, setFilteredData] = useState([]);

       useEffect(() => { 

            onValue(ref(database), (snapshot) => {
                const data = snapshot.val();

                if (data) {
                const fullNameArray = [];
                const emailArray = [];
                const dietaryRestricts = [];

                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                    const entry = data[key];
                    
                    const { firstName, lastName, email, dietaryRestriction } = entry;
                    const fullName = `${firstName} ${lastName}`;
                    //TODO figure out why email is not parsing as a string
                    fullNameArray.push(fullName.toLowerCase()); 
                    if(email != null){ emailArray.push(email.toString());}
                    dietaryRestricts.push(dietaryRestriction)
                    }
                }

                const uniqueNames = [...new Set(fullNameArray)];
                const uniqueEmails = [...new Set(emailArray)];
            
                setFilteredData([...uniqueNames, ...uniqueEmails])
                setDietaryRestriction(dietaryRestricts)
                } else {
                console.log('No data found');
                }
            })
        }, []);

        
        const filteredResults = filteredData.filter((item) =>
              item.toLowerCase().includes(Query.toLowerCase())
            );

       

        return (
          <div>
          <h1>Admin Dashboard</h1>
    
          {/* Search input */}
          <input
            type="text"
            placeholder="Search by name or email"
            value={Query}
            onChange={(e) => setQuery(e.target.value)}
          />
    
          {/* Display filtered names */}
          <h2>Name and Emails</h2>
          <ul>
            {filteredResults.map((results, index) => (
              <li key={index}>{results} - {dietaryRestriction[index]} </li>
            ))}
          </ul>
        </div>
          );

        };

    



export default Search;