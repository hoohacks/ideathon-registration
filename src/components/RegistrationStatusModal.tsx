import React from 'react';
import { Popup } from "reactjs-popup";
import { Box, Typography, Button, Link } from "@mui/material";
import { popupStyles } from "../styles/registrationStyles.tsx";

const RegistrationStatusModal = ({ isOpen, onClose }) => {
  return (
    <Popup open={isOpen} modal onClose={onClose}>
      <Box sx={popupStyles.box}>
        <Typography>Successfully signed up for Ideathon 23-24!</Typography>
        <Link href="https://ideathon.hoohacks.io">
          <Button
            sx={popupStyles.button}
            type="button"
          >
            View Schedule
          </Button>
        </Link>
      </Box>
    </Popup>
  );
};

export default RegistrationStatusModal;