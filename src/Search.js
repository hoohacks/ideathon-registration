import { onValue, ref, get, set } from 'firebase/database';
import { database } from './firebase';

import React, { useEffect, useState } from 'react';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import { styled } from '@mui/material/styles';

import ProgressBar from 'react-bootstrap/ProgressBar'
import Button from 'react-bootstrap/Button'
import 'bootstrap/dist/css/bootstrap.min.css';
import Form from 'react-bootstrap/Form';

import "./search.css";

const theme = createTheme({
  palette: {
    primary: {
      main: '#013a63', // Adjust primary color
    },
    secondary: {
      main: '#F82249', // Adjust secondary color
    },
  },
  typography: {
    fontFamily: 'Arial, sans-serif', // Change font family
    h1: {
      fontSize: '32px', // Adjust heading font size
      fontWeight: 'bold',
      color:"#E2F1E7" // Bold headings
    },
    h2: {
      fontSize: '24px',
    },
    // Add more typography styles as needed
  },
});

function CheckedInProgressBar({percent})
{
  return (<div style={{marginBottom:"40px", marginInline: '10%'}}>
    <ProgressBar now={percent} label={percent + "%"} variant='danger'></ProgressBar>
  </div>)
}

function Search() {
  
    
       const [Query, setQuery] = useState("")
       const [dietaryRestriction, setDietaryRestriction] = useState([])
       const [selectedDietaryRestriction, setSelectedDietaryRestriction] = useState("");
       // varun stuff



       const [Data, setData] = useState({}); 
       const [checkedInCount, setCheckedInCount] = useState(0);

      
       //progress bar
      const [showProgressBar, setShowProgressBar] = useState(false); 
      const percentCheckedIn = (checkedInCount / Object.keys(Data).length * 100).toFixed(2);

      function toggleProgressBar(e)
      {
        setShowProgressBar(e.target.checked)
      }

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
            <div className='background' style={{ textAlign: 'center', padding: '20px', color:'white' }}>
              <h1 className='label' style={{ fontSize: '60px' }}>Ideathon Admin Dashboard</h1>
              <p style={{ fontSize: '24px', textAlign: 'center' }}>
                Checked In: {checkedInCount} | Percentage: {percentCheckedIn}%
                <Form.Check // prettier-ignore
                  inline
                  style = {{fontSize: '15px', marginLeft:'30px'}}
                  type="switch"
                  id="custom-switch"
                  label="Show Progress Bar"
                  onChange={e => (toggleProgressBar(e))}
                />
              </p>
              {showProgressBar && <CheckedInProgressBar  percent={percentCheckedIn}></CheckedInProgressBar>}
              <h2 className='label'>Name and Emails</h2>
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
                    height: '40px',
                    fontSize: '16px',
                  }}
                >
                  <option value="">All Dietary Restrictions</option>
                  <option value="vegetarian">Vegetarian</option>
                  <option value="gluten-free">Gluten-free</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(250px, 1fr))", gap: "20px" }}>
                {filteredResults.map((key, index) => {
                  const personData = Data[key]; // Access the data associated with the key(hash)
        
                const dietaryRestrictionValue = personData[0].dietaryRestriction; // Get dietaryRestriction from the person's data
                const fullName = personData[0].fullName.toString();
                
                const isCheckedIn = personData[0].checkedIn;

                const HoverDiv = styled('div')({
                  transition: "transform 0.10s ease-in-out",
                  "&:hover": { transform: "scale3d(1.07, 1.07, 1)" },
                })
        
                if (!selectedDietaryRestriction || (dietaryRestrictionValue && dietaryRestrictionValue.includes(selectedDietaryRestriction))) {
                  return (
                    <HoverDiv>
                    <div className='gridBox' key={index} style={{  borderRadius: '15px', border: "10px solid #ccc", borderColor:'#013a63', padding: "20px",transition: "background 0.1s", }}
                    
                    //onMouseEnter={(e) => { e.target.style.transform = "scale(1.05)"; }} // Enlarge on hover
                    //onMouseLeave={(e) => { e.target.style.transform = "scale(1)"; }} // Return to the original size
        
                    
                    >
                      <p className='label' style={{ fontSize: '24px', fontWeight: 'bold' }}>{fullName}</p>

                      <p>{dietaryRestrictionValue}</p>
                      <p>{personData[0].email}</p>
                      {personData.map((data, dataIndex) => (
                        <div key={dataIndex}>
                          {data.resume ? (
                            <p>
                            <a href={data.resume} target="_blank" rel="noopener noreferrer" style={{ color: '#89c2d9' }}>
                        {fullName} resume
                            </a>
                            </p>
                          ) : null}
                            <Button
                              onClick={() => handleCheckIn(key)}
                              style={{ borderRadius:"12px", backgroundColor: isCheckedIn ? "#34a0a4" : "#2a6f97", color: "white" }}
                            >
                              {isCheckedIn ? "Checked In" : "Check In"}
                            </Button>
                        </div>
                      ))}
                    </div>
                    </HoverDiv>
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
        
       


        
