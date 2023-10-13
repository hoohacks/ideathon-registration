// CSS Styles
const styles = `
    body {
        font-family: Arial, sans-serif;
    }
    .stats-container {
        max-width: 600px;
        margin: 50px auto;
        padding: 20px;
        border: 1px solid #ccc;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
    .stat {
        margin-bottom: 20px;
    }
`;

// Add styles to the head
let styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

// Dummy data for statistics
const statistics = {
    totalVisits: 10000,
    uniqueVisitors: 5000,
    pageViews: 15000
};

// Create main container
const container = document.createElement('div');
container.className = 'stats-container';

const title = document.createElement('h2');
title.textContent = 'Website Statistics';
container.appendChild(title);

// Function to create stat item
function createStatItem(label, value) {
    const stat = document.createElement('div');
    stat.className = 'stat';

    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    stat.appendChild(strong);

    const span = document.createElement('span');
    span.textContent = value;
    stat.appendChild(span);

    return stat;
}

container.appendChild(createStatItem('Total Visits', statistics.totalVisits));
container.appendChild(createStatItem('Unique Visitors', statistics.uniqueVisitors));
container.appendChild(createStatItem('Page Views', statistics.pageViews));

document.body.appendChild(container);