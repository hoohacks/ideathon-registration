// RegisteredAtDisplay.js

import { onValue, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { database } from './firebase';
import { Line, Bar } from "react-chartjs-2";
import Chart from 'chart.js/auto';

function RegisteredAtDisplay() {
    const [RegisteredAt, setRegisteredAt] = useState([]);
    const [genderCounts, setGenderCounts] = useState({});
    const [schoolCounts, setSchoolCounts] = useState({});

    useEffect(() => { 
        onValue(ref(database), (snapshot) => {
            const data = snapshot.val();

            if (data) {
                const registeredAtArray = [];
                const genderCountsTemp = {};
                const schoolCountsTemp = {};

                for (const key in data) {

                    if (data.hasOwnProperty(key)) {
                        const entry = data[key];

                        // Assume each entry in your database has a "registeredAt" field.
                        if (entry.registeredAt) {
                            registeredAtArray.push(entry.registeredAt);
                        }

                        if (entry.gender) {
                            const gender = entry.gender.trim().toLowerCase();
                            genderCountsTemp[gender] = (genderCountsTemp[gender] || 0) + 1;
                        }

                         if (entry.uvaSchool) {
                             const school = entry.uvaSchool().trim().toLowerCase();
                             schoolCountsTemp[school] = (schoolCountsTemp[school] || 0) + 1;
                        }

                    }

                }

                setRegisteredAt(registeredAtArray);
                setGenderCounts(genderCountsTemp);
                setSchoolCounts(schoolCountsTemp);
            } else {
                console.log('No data found');
            }
        })
    }, []);

    const convertDateToInt = (dateString) => {
        const date = new Date(dateString);
        // Month in JavaScript is 0-indexed (0 is January, 1 is February, etc.)
        const month = date.getMonth() + 1; 
        const day = date.getDate();


        return `${month.toString().padStart(2, '0')}${day.toString().padStart(2, '0')}`
    };

    function makeX() {
        const uniqueDates = new Set();

        RegisteredAt.forEach(date => {
            const formattedDate = convertDateToInt(date);
            uniqueDates.add(formattedDate.slice(0, 2) + '/' + formattedDate.slice(2)); // Insert "/"
        });

        return [...uniqueDates];

    }

    function makeY() {
            const yArr = [];
            let count = 1;
        
            for (let i = 1; i < RegisteredAt.length; i++) {
                if (convertDateToInt(RegisteredAt[i - 1]) === convertDateToInt(RegisteredAt[i])) {
                    count++;
                } else {
                    yArr.push(count); 
                    count = 1; 
                }
            }
        
            yArr.push(count);
        
            return yArr;
    }

    const totalParticipants = RegisteredAt.length;

    const totalParticipantsData = {
            labels: makeX(),
            datasets:[
                {
                    label: 'Total Participants Registered',
                    data: makeY().reduce((acc, currentCount) => {
                        acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + currentCount);
                        return acc;
                    }, []),
                    fill: false,
                    borderWidth: 4,
                    borderColor: '#2a6f97',
                    backgroundColor: '#34a0a4',
                    responsive: true,
                },
            ],
    };

    const prepGenderData = () => {

        const labels = Object.keys(genderCounts).map(gender => {
            return gender.charAt(0).toUpperCase() + gender.slice(1);
        });

        const genderDataCounts = Object.values(genderCounts);

        return {
            labels: labels,
            datasets: [
                {
                    label: "Number of Participants",
                    data: genderDataCounts,
                    borderWidth: 4,
                    borderColor: '#2a6f97',
                    backgroundColor: '#34a0a4',
                    responsive: true,
                },

            ],

        };

    };

    const prepSchoolData = () => {
        const labels = Object.keys(schoolCounts).map(school => school.charAt(0).toUpperCase() + school.slice(1));
        const schoolDataCounts = Object.values(schoolCounts);
        return {
            labels: labels,
            datasets: [
                {
                    label: "Number of Participants per School",
                    data: schoolDataCounts,
                    borderWidth: 4,
                    borderColor: '#2a6f97',
                    backgroundColor: '#34a0a4',
                    responsive: true,
                },
            ],
        };
    };

    return ( // renders all the graphs
        <>

        <h1 style={{textAlign: 'center', backgroundColor: '#34a0a4', color: 'white'}}>Metrics for HooHacks' Ideathon</h1>

        <br></br>
        <br></br>

        <div style={{margin: '0 auto', width: '80%', minWidth: '300px'}}>
            <h2 style={{textAlign: 'center'}}>Number of Participants that Register on a Given Day</h2>
            <Line
                data={{
                // x-axis label values
                labels: makeX(),
                datasets: [
                    {
                        label: "# of Participants Registered",
                        // y-axis data plotting values
                        data: makeY(),
                        fill: false,
                        borderWidth:4,
                        borderColor:'#2a6f97',
                        backgroundColor: "#34a0a4",
                        responsive:true
                    },
                ],
                }}
            />
        </div>
        
        <br></br>
        <br></br>

        <div style={{margin: '0 auto', width: '80%', minWidth: '300px'}}>
            <h2 style={{textAlign: 'center'}}>Total Number of Registrations</h2>
            <Line data={totalParticipantsData} />
        </div>

        <br></br>
        <br></br>

        <div style={{margin: '0 auto', width: '80%', minWidth: '300px'}}>
            <h2 style={{textAlign: 'center'}}>Gender Distribution</h2>
            <Bar 
                data={prepGenderData()} 
                options={{
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                    },
                }} 
            />

        </div>

        <br></br>
        <br></br>

        <div style={{margin: '0 auto', width: '80%', minWidth: '300px'}}>
            <h2 style={{textAlign: 'center'}}>School Distribution</h2>
            <Bar 
                data={prepSchoolData()} 
                options={{ 
                    responsive: true, 
                    plugins: { 
                        legend: { 
                            position: 'top' 
                        },
                            tooltip: { 
                                enabled: true 
                            }
                    },
                scales: {
                    x: { 
                        title: { display: true, text: 'Schools' }
                    },
                    y: {
                        title: { display: true, text: 'Number of Participants' }
                    }
                }
            }} 
        />

    </div>
    
</>
    );

   
}


export default RegisteredAtDisplay;
