import { onValue, ref, get, set } from 'firebase/database';
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
          <div style={{ textAlign: 'center', background: '#232D4B', color: 'white', padding: '20px' }}>
            <h1 style={{ fontSize: '60px' }}>Ideathon Admin Dashboard</h1>
        
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              {/* Search input */}
              <input
                type="text"
                placeholder="Search by name or email"
                value={Query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '300px', // Adjust the width as needed
                  height: '40px', // Adjust the height as needed
                  fontSize: '16px' // Adjust the font size as needed
                }}
              />

              <select
                value={selectedDietaryRestriction}
                onChange={(e) => setSelectedDietaryRestriction(e.target.value)}
                style={{
                  width: '300px', // Adjust the width as needed
                  height: '46px', // Adjust the height as needed
                  fontSize: '16px' // Adjust the font size as needed
                }}
              >
                <option value="">All Dietary Restrictions</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="gluten">Gluten-free</option>
                <option value="other">Other</option>
              </select>
            </div>

        
            <h2>Name and Emails</h2>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(250px, 1fr))", gap: "20px" }}>
              {filteredResults.map((fullName, index) => {
                const personData = Data[fullName]; // Access the data associated with the FullName
        
                const dietaryRestrictionValue = personData[0].dietaryRestriction; // Get dietaryRestriction from the person's data
                const isCheckedIn = checkedInStatus[fullName.toLowerCase()] || false;
        
                if (!selectedDietaryRestriction || (dietaryRestrictionValue && dietaryRestrictionValue.includes(selectedDietaryRestriction))) {
                  return (
                    <div key={index} style={{ border: "1px solid #ccc", padding: "20px",transition: "background 0.1s", }}
                    
                    onMouseEnter={(e) => { e.target.style.transform = "scale(1.05)"; }} // Enlarge on hover
                    onMouseLeave={(e) => { e.target.style.transform = "scale(1)"; }} // Return to the original size
        
                    
                    >
                      <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{fullName}</p>

                      <p>{dietaryRestrictionValue}</p>
                      <p>{personData[0].email}</p>
                      {personData.map((data, dataIndex) => (
                        <div key={dataIndex}>
                          {data.resume ? (
                            <p>
                            <a href={data.resume} target="_blank" rel="noopener noreferrer" style={{ color: 'orange' }}>
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
        
            <p style={{ fontSize: '50px' }}>
            {checkedInCount}|{((checkedInCount / Object.keys(Data).length) * 100)}%
            </p>  
          </div>
        );
        

        

        };

    



export default Search