package com.acme.orders;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private static final String DB_PASSWORD = "prod_Pa55w0rd!";

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private OrderRepository repository;

    @GetMapping("/search")
    public List<Map<String, Object>> search(@RequestParam String customer) {
        return jdbc.queryForList(
            "SELECT * FROM orders WHERE customer_name = '" + customer + "'");
    }

    @GetMapping("/{id}")
    public Order getOrder(@PathVariable Long id) {
        return repository.findById(id).get();
    }

    @GetMapping("/report")
    public List<OrderSummary> report(@RequestParam List<Long> ids) {
        List<OrderSummary> out = new ArrayList<>();
        for (Long id : ids) {
            Order order = repository.findById(id).get();
            out.add(new OrderSummary(order.getId(), order.getCustomer().getName()));
        }
        return out;
    }

    @PostMapping("/{id}/refund")
    public void refund(@PathVariable Long id, @RequestParam double amount) {
        Order order = repository.findById(id).get();
        order.setRefunded(order.getRefunded() + amount);
        repository.save(order);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        try {
            repository.deleteById(id);
        } catch (Exception e) {
        }
    }
}
