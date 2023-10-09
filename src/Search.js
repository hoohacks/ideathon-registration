import { onValue, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { database } from './firebase';




function Search() {
    
       const [Query, setQuery] = useState("")
       const [Resume, setResume] = useState([])
       const [dietaryRestriction, setDietaryRestriction] = useState([])
       const [FullName, setFullName] = useState([]);
       const [Email, setEmail] = useState([]);
       const [selectedDietaryRestriction, setSelectedDietaryRestriction] = useState("");

       useEffect(() => { 

            onValue(ref(database), (snapshot) => {
                const data = snapshot.val();

                if (data) {
                const fullNameArray = [];
                const emailArray = [];
                const dietaryRestrictsArray = []
                const resumesArray = [];

                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                    const entry = data[key];
                
                    const { firstName, lastName, email, dietaryRestriction, resume} = entry;
                    const fullName = `${firstName} ${lastName}`;

                    if(fullName != "" && fullName != null){fullNameArray.push(fullName.toLowerCase());}

                    if(email != null){emailArray.push(email.toString().toLowerCase());}
                    
                    if(dietaryRestriction != null){dietaryRestrictsArray.push(dietaryRestriction.toString().trim().toLowerCase())}

                    if(resume != null){resumesArray.push(resume)
                    }
                  }
                }

                const uniqueNames = [...new Set(fullNameArray)];
                const uniqueEmails = [...new Set(emailArray)];
                const uniqueResumes = [...new Set(resumesArray)]
            
                setFullName(uniqueNames)
                setEmail(uniqueEmails)
                setDietaryRestriction(dietaryRestrictsArray)
                setResume(uniqueResumes)

                } else {
                console.log('No data found');
                }
            })
        }, []);

        
        const filteredResults = FullName.filter((fullName, index) => {
          const email = Email[index];
        
          const matchesQuery = fullName.toLowerCase().includes(Query.toLowerCase()) ||
            (email && email.toLowerCase().includes(Query.toLowerCase()));
        
          return matchesQuery 
        });
       

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

          <select
                value={selectedDietaryRestriction}
                onChange={(e) => setSelectedDietaryRestriction(e.target.value)}
              >
                <option value="">All Dietary Restrictions</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="gluten">Gluten-free</option>
                <option value="other">other</option>
          </select>
    
          <h2>Name and Emails</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px"}}>
          {filteredResults.map((results, index) => {
              const dietaryRestrictionValue = dietaryRestriction[index];
              if (!selectedDietaryRestriction || (dietaryRestrictionValue && dietaryRestrictionValue.includes(selectedDietaryRestriction))) {
                return (
                  <div key={index} style={{ border: "1px solid #ccc", padding: "10px" }}>
                    <p>{results} - {Email.length} - {FullName.length}</p>
                    <p>{dietaryRestrictionValue}</p>
                    <p>{Email[index]}</p>
                    {Resume[index] ? (
                      <p>
                        <a href={Resume[index]} target="_blank" rel="noopener noreferrer">
                          {results} resume
                        </a>
                      </p>
                    ) : null}
                  </div>
                );
              } else {
                return null; // Do not render if the dietary restriction does not match
              }
            })}
          </div>
        </div>
          );

        };

    



export default Search;