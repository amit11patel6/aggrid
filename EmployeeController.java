package com.example.aggridssremployee.controller;

import com.example.aggridssremployee.dto.ServerSideGetRowsRequest;
import com.example.aggridssremployee.dto.ServerSideGetRowsResponse;
import com.example.aggridssremployee.service.EmployeeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;

@RestController
@RequestMapping("/api/employees")
// Uncomment the line below if you are not using global CORS configuration
// and your frontend is on a different origin (e.g., different port).
// For production, configure CORS properly in application.properties or a CorsConfiguration bean.
// @CrossOrigin(origins = "http://localhost:4200") // Replace with your frontend URL
public class EmployeeController {

    private static final Logger logger = LoggerFactory.getLogger(EmployeeController.class);

    private final EmployeeService employeeService;

    @Autowired
    public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @PostMapping("/ssrm-data")
    public ResponseEntity<ServerSideGetRowsResponse> getEmployeeData(@RequestBody ServerSideGetRowsRequest request) {
        logger.info("Received request for /api/employees/ssrm-data");
        try {
            ServerSideGetRowsResponse response = employeeService.getData(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            // Log the exception properly in a real application with more context
            logger.error("Error processing AG Grid SSRM request for employees", e);
            // Return an appropriate error response. AG Grid handles empty data gracefully.
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ServerSideGetRowsResponse(Collections.emptyList(), 0)); // Or return a specific error DTO if needed
        }
    }
}
