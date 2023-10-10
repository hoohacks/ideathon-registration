import { onValue, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { database } from './firebase';




function Search() {
    
       const [Query, setQuery] = useState("")
       const [dietaryRestriction, setDietaryRestriction] = useState([])
       const [selectedDietaryRestriction, setSelectedDietaryRestriction] = useState("");
       // varun stuff
       const [checkedInStatus, setCheckedInStatus] = useState({}); // Object to store checked-in status
       const [checkedInCount, setCheckedInCount] = useState(0);
       



       const [Data, setData] = useState({}); 

        useEffect(() => {
          onValue(ref(database), (snapshot) => {
            const data = snapshot.val();

            if (data) {
              const newData = {}; 

              for (const key in data) {
                if (data.hasOwnProperty(key)) {
                  const entry = data[key];

                  const { firstName, lastName, email, dietaryRestriction, resume } = entry;
                  const fullName = `${firstName} ${lastName}`;

                  if (fullName != null) {
                    if (!newData[fullName]) {
                      newData[fullName] = [];
                      newData[fullName].push({ email, dietaryRestriction, resume });
                    }
                  }
                }
              }

              // Set the newData object as the state
              setData(newData);
            }
          });
        }, []);

        const handleCheckIn = (fullName) => {
          // Toggle the checked-in status for the given fullName
          setCheckedInStatus((prevStatus) => ({
            ...prevStatus,
            [fullName.toLowerCase()]: !prevStatus[fullName.toLowerCase()],
          }));
      
          // Update the checkedInCount based on the new status
          setCheckedInCount((prevCount) => {
            return checkedInStatus[fullName.toLowerCase()] ? prevCount - 1 : prevCount + 1
        }
         );
        };

        
        const filteredResults = Object.keys(Data).filter((fullName) => {
          const personData = Data[fullName];
          const email = personData[0].email; // Get email from the person's data
        
          const matchesQuery =
            fullName.toLowerCase().includes(Query.toLowerCase()) ||
            (email && email.toLowerCase().includes(Query.toLowerCase()));
        
          return matchesQuery;
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
          {filteredResults.map((fullName, index) => {
            const personData = Data[fullName]; // Access the data associated with the FullName

            const dietaryRestrictionValue = personData[0].dietaryRestriction; // Get dietaryRestriction from the person's data
            const isCheckedIn = checkedInStatus[fullName.toLowerCase()] || false;

            if (!selectedDietaryRestriction || (dietaryRestrictionValue && dietaryRestrictionValue.includes(selectedDietaryRestriction))) {
              return (
                <div key={index} style={{ border: "1px solid #ccc", padding: "10px" }}>
                  <p>{fullName}</p>
                  <p>{dietaryRestrictionValue}</p>
                  <p>{personData[0].email}</p>
                  {personData.map((data, dataIndex) => (
                    <div key={dataIndex}>
                      {data.resume ? (
                        <p>
                          <a href={data.resume} target="_blank" rel="noopener noreferrer">
                            {fullName} resume
                          </a>
                        </p>
                      ) : null}
                      <button
                        onClick={() => handleCheckIn(fullName)}
                        style={{ backgroundColor: isCheckedIn ? "green" : "blue", color: "white" }}
                      >
                        {isCheckedIn ? "Checked In" : "Check In"}
                      </button>
                    </div>
                  ))}
                </div>
              );
            } else {
              return null; // Do not render if the dietary restriction does not match
            }
          })}
        </div>

          <p>Total Checked In: {(checkedInCount)} - Percent Checked In: {((checkedInCount/Object.keys(Data).length) * 100)} % </p> 
        </div>
          );

        };

    



export default Search