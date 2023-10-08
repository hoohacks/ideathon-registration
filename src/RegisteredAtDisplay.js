// RegisteredAtDisplay.js

import { onValue, ref } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { database } from './firebase';
import { Line, Bar } from "react-chartjs-2";
import Chart from 'chart.js/auto';

function RegisteredAtDisplay() {
    const [RegisteredAt, setRegisteredAt] = useState([]);

    useEffect(() => { 
        onValue(ref(database), (snapshot) => {
            const data = snapshot.val();

            if (data) {
                const registeredAtArray = [];

                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                        const entry = data[key];

                        // Assume each entry in your database has a "registeredAt" field.
                        if (entry.registeredAt) {
                            registeredAtArray.push(entry.registeredAt);
                        }
                    }
                }

                setRegisteredAt(registeredAtArray);
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
                    borderColor: '#6495ed',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    responsive: true,
                },
            ],
    };
    

    
    return (
        <>
        <div>
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
                    borderColor:'#6495ed',
                    backgroundColor: "rgb(255, 99, 132)",
                    responsive:true
                    },
                ],
                }}
            />
        </div>

        <div>
            <Line data={totalParticipantsData} />
        </div>

        <div>
            {RegisteredAt.map((date, index) => (
                <div key={index}>{convertDateToInt(date)}</div>
            ))}
        </div>
    </>
    );
}


export default RegisteredAtDisplay;
