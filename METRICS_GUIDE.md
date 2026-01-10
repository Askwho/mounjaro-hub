# Pen Tracking Metrics Guide

## Overview

The Mounjaro Hub now includes comprehensive pen tracking and metrics to help you optimize medication usage and minimize waste. The most critical metric tracked is **days between last use and expiry** - this helps you understand how efficiently you're using pens before they expire.

## Key Features

### 1. Critical Metrics Dashboard

The metrics tab displays the most important tracking information:

- **Average Days Between Last Use and Expiry**: Shows how close pens come to their expiry date after last use
- **Pens Expired With Medication**: Count of pens that expired while still containing medication
- **Pens At Risk**: Number of pens that may expire before being fully used at current dosing rate

### 2. Individual Pen Metrics

For each pen, the system tracks:

- **Efficiency**: Percentage of pen capacity that has been used
- **Days to Expiry**: Remaining time before expiration
- **Last Use Gap**: Days between last completed dose and expiry date (the critical metric!)
- **Waste**: Amount of medication remaining when pen expired
- **Risk Assessment**: Prediction of whether pen will expire before being fully used

### 3. Risk Levels

Pens are automatically assessed for expiry risk:

- **High Risk**: Pen will likely expire 14+ days before being fully used
- **Medium Risk**: Pen will likely expire 7-14 days before being fully used
- **Low Risk**: Pen will likely expire 1-7 days before being fully used
- **No Risk**: Pen should be fully used before expiry

## How to Use

### Viewing Metrics

1. Navigate to the **Metrics** tab in the main navigation
2. View the critical metrics dashboard at the top
3. Review system-wide statistics (total pens, efficiency, waste)
4. Check the "Pens At Risk" section for warnings
5. Examine detailed per-pen metrics in the table

### Saving Metrics Snapshots

To track trends over time:

1. Click **"Save Daily Snapshot"** button in the Metrics tab
2. This saves today's metrics to the database
3. Snapshots can be used for historical analysis and trend tracking

**Note**: Currently, snapshots need to be saved manually. In the future, this could be automated to run daily.

### Understanding the Metrics

#### Days Between Last Use and Expiry (Critical Metric)

This is the **most important metric** for minimizing waste:

- **Green (30+ days)**: Good! You finished the pen well before expiry
- **Amber (14-30 days)**: Acceptable, but could be optimized
- **Red (<14 days)**: Warning! Pen was used very close to expiry or expired with medication

**Goal**: Maximize this number by:
- Using pens that expire sooner first
- Adjusting dose schedules to finish pens before expiry
- Ordering pens with expiry dates that match your usage rate

#### Usage Efficiency

- **90%+**: Excellent! (🏆 Award badge shown)
- **70-89%**: Good efficiency
- **<70%**: Poor efficiency, significant waste

#### Waste Metrics

Total medication (in mg) that expired unused:
- Helps quantify the cost of expired medication
- Track improvements over time by comparing snapshots

### Taking Action on Risk Warnings

If pens show risk warnings:

1. **Increase dose frequency**: Use the pen more often if medically appropriate
2. **Switch to at-risk pen**: Prioritize using pens that will expire soon
3. **Adjust purchasing**: Order pens with later expiry dates
4. **Consult healthcare provider**: Discuss dose adjustments if needed

## Database Setup

To enable historical metrics tracking:

1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Run the migration script: `supabase-metrics-migration.sql`
4. This creates two tables:
   - `pen_metrics_snapshots`: Daily snapshots per pen
   - `system_metrics_snapshots`: Daily system-wide aggregations

## Future Enhancements

Potential improvements:

- **Automatic daily snapshots**: Scheduled job to save metrics automatically
- **Trend charts**: Visualize efficiency and waste over time
- **Smart alerts**: Email/push notifications for at-risk pens
- **Optimization suggestions**: AI-powered recommendations for dosing schedules
- **Historical comparison**: Compare current period vs. previous months

## Metric Definitions

| Metric | Definition | Use Case |
|--------|------------|----------|
| **Efficiency** | (Mg Used / Total Capacity) × 100 | Measure how completely pens are used |
| **Days to Expiry** | Calendar days until expiration date | Track urgency of pen usage |
| **Last Use Gap** | Days from last completed dose to expiry | **Critical metric** for waste minimization |
| **Waste** | Mg remaining when pen expired | Quantify medication loss |
| **Risk Level** | Prediction based on dosing rate vs. expiry | Prevent future waste |

## Tips for Minimizing Waste

1. **Track regularly**: Check metrics weekly to stay aware of at-risk pens
2. **Save snapshots**: Build historical data to identify patterns
3. **Prioritize by expiry**: Always use the pen expiring soonest
4. **Plan ahead**: Schedule doses to ensure pens are fully used before expiry
5. **Order wisely**: Match pen quantities and expiry dates to your actual usage rate

## Support

If you have questions or suggestions for improving the metrics system, please open an issue on GitHub.
