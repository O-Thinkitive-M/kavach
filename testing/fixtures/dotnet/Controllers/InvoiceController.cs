using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Linq;
using Microsoft.AspNetCore.Mvc;

namespace Acme.Api.Controllers
{
    [ApiController]
    [Route("api/invoices")]
    public class InvoiceController : ControllerBase
    {
        private const string ConnectionString =
            "Server=prod-db;Database=billing;User Id=sa;Password=Sup3rSecret!;";

        private readonly AppDbContext _db;

        public InvoiceController(AppDbContext db)
        {
            _db = db;
        }

        [HttpGet("search")]
        public IEnumerable<Invoice> Search(string customer)
        {
            using var conn = new SqlConnection(ConnectionString);
            conn.Open();
            var cmd = new SqlCommand(
                "SELECT * FROM Invoices WHERE Customer = '" + customer + "'", conn);
            var reader = cmd.ExecuteReader();
            var list = new List<Invoice>();
            while (reader.Read())
            {
                list.Add(new Invoice { Id = reader.GetInt32(0) });
            }
            return list;
        }

        [HttpGet("{id}")]
        public Invoice Get(int id)
        {
            return _db.Invoices.FirstOrDefault(i => i.Id == id);
        }

        [HttpGet("totals")]
        public decimal Totals(List<int> ids)
        {
            decimal total = 0;
            foreach (var id in ids)
            {
                var invoice = _db.Invoices.FirstOrDefault(i => i.Id == id);
                total += invoice.Amount;
            }
            return total;
        }

        [HttpPost("{id}/void")]
        public IActionResult Void(int id)
        {
            try
            {
                var invoice = _db.Invoices.Find(id);
                invoice.Status = "void";
                _db.SaveChanges();
            }
            catch (Exception) { }
            return Ok();
        }
    }
}
