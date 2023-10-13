import { DataSnapshot, onValue } from 'firebase/database';
import {analytics} from './firebase';

function file() {
    useEffect = () => {
        onValue(ref(analytics), (DataSnapshot))
        
    }

}