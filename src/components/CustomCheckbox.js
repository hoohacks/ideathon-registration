import { withStyles } from '@mui/styles';
import { Checkbox } from '@mui/material';



const checkBoxStyles = theme => ({
    root: {
      '&$checked': {
        color: '#f82249',
      },
    },
    checked: {},
   })

const CustomCheckbox = withStyles(checkBoxStyles)(Checkbox);

export default CustomCheckbox;