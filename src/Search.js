import { onValue, ref, get, set } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { database } from './firebase';
import { ThemeProvider, createTheme } from '@mui/material/styles';
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976D2', // Adjust primary color
    },
    secondary: {
      main: '#F82249', // Adjust secondary color
    },
  },
  typography: {
    fontFamily: 'Arial, sans-serif', // Change font family
    h1: {
      fontSize: '32px', // Adjust heading font size
      fontWeight: 'bold', // Bold headings
    },
    h2: {
      fontSize: '24px',
    },
    // Add more typography styles as needed
  },
});



function Search() {
  
    
       const [Query, setQuery] = useState("")
       const [dietaryRestriction, setDietaryRestriction] = useState([])
       const [selectedDietaryRestriction, setSelectedDietaryRestriction] = useState("");
       // varun stuff
       
       
       



       const [Data, setData] = useState({}); 
       const [checkedInCount, setCheckedInCount] = useState(0);

        useEffect(() => {
          onValue(ref(database), (snapshot) => {
            const data = snapshot.val();
            if (data) {
              const newData = {}; 
              let newCheckedInCount = 0;

              for (const key in data) {
                if (data.hasOwnProperty(key)) {
                  const entry = data[key];
                  
                  const { firstName, lastName, email, dietaryRestriction, resume, checkedIn} = entry;
                  const fullName = `${firstName} ${lastName}`;

                  if (key != null) {
                    if (!newData[key]) {
                      newData[key] = [];
                      newData[key].push({fullName,email, dietaryRestriction, resume,checkedIn});

                      if (checkedIn) {
                        newCheckedInCount++;
                      }
                    }
                  }
                }
              }

              // Set the newData object as the state
              setData(newData);
              setCheckedInCount(newCheckedInCount);
            }
          });
        }, []);

       

        const handleCheckIn = (key) => {
          // Get a reference to the participant's check-in status in Firebase
          const participantRef = ref(database, "/" + key);
        
          // Use the set function to update the check-in status
          get(participantRef).then((snapshot) => {
            const personData = snapshot.val() || false;
            if(personData == false) {
              return;
            }
            
            
            personData.checkedIn = !personData.checkedIn;
            
            set(participantRef, personData);

           
          });
        };

        
        const filteredResults = Object.keys(Data).filter((key) => {
          const personData = Data[key];
          const fullName = personData[0].fullName.toString();
          const email = personData[0].email; // Get email from the person's data
        
          const matchesQuery =
            fullName.toLowerCase().includes(Query.toLowerCase()) ||
            (email && email.toLowerCase().includes(Query.toLowerCase()));
        
          return matchesQuery;
        });

        return (
          <ThemeProvider theme={theme}>
            <div style={{ textAlign: 'center', background: '#232D4B', color: 'white', padding: '20px' }}>
              <h1 style={{ fontSize: '60px' }}>Ideathon Admin Dashboard</h1>
              <p style={{ fontSize: '24px', textAlign: 'center' }}>
                Checked In: {checkedInCount} | Percentage: {((checkedInCount / Object.keys(Data).length) * 100).toFixed(2)}%
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                {/* Search input */}
                <input
                  type="text"
                  placeholder="Search by name or email"
                  value={Query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{
                    width: '300px',
                    height: '40px',
                    fontSize: '16px',
                  }}
                />
                <select
                  value={selectedDietaryRestriction}
                  onChange={(e) => setSelectedDietaryRestriction(e.target.value)}
                  style={{
                    width: '300px',
                    height: '45px',
                    fontSize: '16px',
                  }}
                >
                  <option value="">All Dietary Restrictions</option>
                  <option value="vegetarian">Vegetarian</option>
                  <option value="gluten-free">Gluten-free</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <h2>Name and Emails</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(250px, 1fr))", gap: "20px" }}>
                {filteredResults.map((key, index) => {
                  const personData = Data[key]; // Access the data associated with the key(hash)
        
                const dietaryRestrictionValue = personData[0].dietaryRestriction; // Get dietaryRestriction from the person's data
                const fullName = personData[0].fullName.toString();
                
                const isCheckedIn = personData[0].checkedIn;
        
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
                            onClick={() => handleCheckIn(key)}
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
            </div>
          </ThemeProvider>
        );
      }
      
      export default Search;
        
       


        
