import { Routes, Route } from "react-router-dom"
import Registration from "./Registration"
import Search from "./Search"

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={ <Registration/> } />
        <Route path="/ideathon-registration" element={ <Registration/> } />
        <Route path="/search" element={ <Search/> } />
      </Routes>
    </div>
  )
}

export default App