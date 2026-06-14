-- Get the full source of the live process_executed_position function
SELECT prosrc FROM pg_proc WHERE oid = 18606;

-- Also check: what does the most recent position show for that 0.3 qty order?
SELECT o.qty AS order_qty, o.lots AS order_lots, p.qty_open, p.qty_total
FROM orders o
LEFT JOIN positions p ON p.user_id = o.user_id AND p.symbol = o.symbol
WHERE o.qty = 0.3
ORDER BY o.created_at DESC
LIMIT 3;
